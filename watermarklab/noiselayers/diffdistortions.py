import math
import torch
import kornia
import random
import itertools
import numpy as np
import torch.nn as nn
from typing import Tuple
from torch import Tensor
import torch.nn.functional as F
from kornia.filters import MedianBlur
from torch.nn.functional import conv2d
import torchvision.transforms as transforms
from watermarklab.basemodel import BaseDiffNoiseModel

__all__ = ["Identity", "GaussianBlur",
           "GaussianNoise", "Jpeg", "SaltPepperNoise",
           "FieldOfViewTransformer", "RandomCompensateTransformer", "MedianBlur",
           "Dropout", "Cropout", "Contrast", "ScreenCapture",
           "Hue", "Brightness", "Saturation", "Resize", "Rotate"]


class Identity(BaseDiffNoiseModel):
    def __init__(self, test: bool = False, max_step: int = 100):
        super().__init__()

    def forward(self, marked_img, cover_img, now_step: int = 0):
        return marked_img


class GaussianBlur(BaseDiffNoiseModel):
    def __init__(self, kernel_size: Tuple[int, int] = (7, 7), sigmas: Tuple[float, float] = (1.5, 1.5),
                 prob: float = 0.8, max_step: int = 100):
        """
        Initializes the GaussianBlur class with specified kernel size, sigmas, probability, and max step.

        Parameters:
        - kernel_size: Tuple[int, int] - Size of the kernel for the Gaussian blur.
        - sigmas: Tuple[float, float] - Standard deviation values (sigma) for the Gaussian kernel.
        - prob: float - Probability of applying Gaussian blur.
        - max_step: int - Maximum step count to control the strength of the blur over time.
        """
        super(GaussianBlur, self).__init__()
        self.kernel_size = kernel_size  # Gaussian kernel size (height, width)
        self.sigmas = sigmas  # Sigma values for vertical and horizontal directions
        self.prob = prob  # Probability of applying blur
        self.max_step = max(max_step, 1)  # Maximum step count for blur control

    def compute_zero_padding(self, kernel_size: Tuple[int, int]) -> Tuple[int, int]:
        """
        Computes the padding size needed to maintain input dimensions after convolution.

        Parameters:
        - kernel_size: Tuple[int, int] - Size of the Gaussian kernel.

        Returns:
        - padding: Tuple[int, int] - Padding values for height and width.
        """
        return kernel_size[0] // 2, kernel_size[1] // 2  # Compute padding based on kernel size

    def compute_gaussian_kernel(self, kernel_size: Tuple[int, int], sigmas: Tuple[float, float]) -> torch.Tensor:
        """
        Computes a 2D Gaussian kernel with given size and sigma values.

        Parameters:
        - kernel_size: Tuple[int, int] - Gaussian kernel dimensions (height, width).
        - sigmas: Tuple[float, float] - Standard deviations for Gaussian blur (vertical, horizontal).

        Returns:
        - kernel: torch.Tensor - 2D Gaussian kernel as a tensor of shape (1, 1, kernel_size[0], kernel_size[1]).
        """
        # Compute 1D Gaussian for vertical direction (height)
        gauss_y = torch.exp(-torch.pow(torch.arange(kernel_size[0]) - kernel_size[0] // 2, 2) / (2 * sigmas[0] ** 2))
        gauss_y = gauss_y / gauss_y.sum()  # Normalize Gaussian values along y-axis

        # Compute 1D Gaussian for horizontal direction (width)
        gauss_x = torch.exp(-torch.pow(torch.arange(kernel_size[1]) - kernel_size[1] // 2, 2) / (2 * sigmas[1] ** 2))
        gauss_x = gauss_x / gauss_x.sum()  # Normalize Gaussian values along x-axis

        # Create 2D Gaussian kernel by taking outer product and adding batch/channel dimensions
        kernel = torch.outer(gauss_y, gauss_x).unsqueeze(0).unsqueeze(0)
        return kernel

    def random_kernels_sigmas(self):
        """
        Generates random kernel sizes and sigma values within specified limits.

        Returns:
        - kernel_size: Tuple[int, int] - Randomized kernel size for Gaussian blur.
        - sigmas: Tuple[float, float] - Randomized sigma values for vertical and horizontal directions.
        """
        # Generate random kernel sizes within range and ensure odd dimensions
        kernel_size_y = random.randint(3, self.kernel_size[0] + 1)
        kernel_size_x = random.randint(3, self.kernel_size[1] + 1)
        if kernel_size_y % 2 == 0:
            kernel_size_y += 1
        if kernel_size_x % 2 == 0:
            kernel_size_x += 1

        return (kernel_size_y, kernel_size_x)

    def compute_gaussian_kernel2d(self, sigmas, test=False):
        """
        Computes a 2D Gaussian kernel and padding. If not in test mode, uses randomized parameters.

        Parameters:
        - sigmas: Tuple[float, float] - Standard deviation values for the Gaussian kernel.
        - test: bool - Flag indicating whether to use fixed kernel and sigma values (True) or random ones (False).

        Returns:
        - padding: Tuple[int, int] - Required zero padding for the kernel.
        - kernel: torch.Tensor - 2D Gaussian kernel tensor.
        """
        # Determine kernel size based on test mode
        if not test:
            kernel_size = self.random_kernels_sigmas()
        else:
            kernel_size = self.kernel_size

        # Compute padding and kernel with specified or random parameters
        padding = self.compute_zero_padding(kernel_size)
        kernel = self.compute_gaussian_kernel(kernel_size, sigmas)
        return padding, kernel

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> Tensor:
        """
        Applies Gaussian blur to the input tensor with dynamic sigma control.

        Parameters:
        - marked_img: torch.Tensor - Input tensor of shape (batch_size, channels, height, width).
        - cover_img: torch.Tensor (Optional) - Not used in this implementation.
        - now_step: int - Current step for dynamic sigma adjustment.

        Returns:
        - noised_img: torch.Tensor - Blurred tensor with values clamped between [0, 1].
        """
        noised_img = marked_img

        # Dynamic sigma calculation based on current step
        _sigma_1 = min(now_step, self.max_step) / self.max_step * self.sigmas[0]
        _sigma_2 = min(now_step, self.max_step) / self.max_step * self.sigmas[1]
        _sigmas = (_sigma_1, _sigma_2)

        # Apply blur based on probability
        if random.uniform(0, 1) < self.prob:
            b, c, h, w = marked_img.shape  # Get input tensor shape

            # Compute Gaussian kernel and padding, adjust to input device
            padding, kernel = self.compute_gaussian_kernel2d(_sigmas, False)
            kernel = kernel.to(marked_img.device).repeat(c, 1, 1, 1)

            # Apply Gaussian blur with conv2d and clamp result
            noised_img = conv2d(marked_img, kernel, padding=padding, stride=1, groups=c)

        return noised_img.clamp(0, 1.)


class Brightness(BaseDiffNoiseModel):
    def __init__(self, brightness_factor: float = 0.15, prob: float = 0.8, max_step: int = 100):
        """
        Initializes the Brightness class to adjust image brightness with a specified probability.

        Parameters:
        - brightness_factor (float): The maximum factor by which to adjust brightness.
                                     Should be in the range [0, ∞), where 1 means no change.
        - prob (float): The probability of applying the brightness adjustment.
        - max_step (int): The maximum step count to control brightness factor incrementally.
        """
        super(Brightness, self).__init__()
        self.prob = prob  # Probability of applying brightness transformation
        self.max_step = max(max_step, 1)  # Maximum step count to control brightness scaling
        self.brightness_factor = brightness_factor  # Maximum brightness adjustment factor

    def forward(self, marked_img, cover_img=None, now_step: int = 0):
        """
        Applies the brightness transformation to the input image tensor.

        Parameters:
        - marked_img (Tensor): The input image tensor.
        - cover_img (Tensor, optional): Optional cover image (not used in this transformation).
        - now_step (int): Current step for dynamic adjustment of brightness factor.

        Returns:
        - noised_img (Tensor): Brightness-adjusted image tensor, clamped to [0, 1].
        """
        noised_img = marked_img  # Initialize output image tensor as input image

        # Calculate brightness factor based on current step and max step
        _brightness_factor = min(now_step, self.max_step) / self.max_step * self.brightness_factor

        # Apply brightness transformation based on probability
        if random.uniform(0., 1.) < self.prob:
            # Adjust brightness using ColorJitter with computed factor
            noised_img = transforms.ColorJitter(brightness=_brightness_factor)(marked_img)

        # Clamp pixel values to [0, 1] range
        return noised_img.clamp(0, 1.)


class Contrast(BaseDiffNoiseModel):
    def __init__(self, contrast_factor: float = 0.15, prob: float = 0.8, max_step: int = 100):
        """
        Initializes the Contrast transformation.

        Args:
            contrast_factor (float): Factor by which to adjust contrast.
                                     Should be in the range [0, ∞), where 1 means no change.
            prob (float): Probability of applying the transformation.
            max_step (int): Maximum step count to control contrast factor incrementally.
        """
        super(Contrast, self).__init__()
        self.contrast_factor = contrast_factor  # Maximum contrast adjustment factor
        self.prob = prob  # Probability of applying contrast transformation
        self.max_step = max(max_step, 1)  # Maximum step count for controlling contrast scaling

    def forward(self, marked_img, cover_img=None, now_step: int = 0):
        """
        Applies the contrast transformation to the input image tensor.

        Args:
            marked_img (Tensor): The input image tensor.
            cover_img (Tensor, optional): An optional cover image tensor (not used in this transform).
            now_step (int): Current step for dynamic adjustment of contrast factor.

        Returns:
            Tensor: The transformed image tensor, clamped to [0, 1].
        """
        noised_img = marked_img  # Initialize output image tensor as input image

        # Calculate contrast factor based on current step and max step
        _contrast_factor = min(now_step, self.max_step) / self.max_step * self.contrast_factor

        # Apply the contrast transformation based on probability
        if random.uniform(0., 1.) < self.prob:
            # Adjust contrast using ColorJitter with computed factor
            noised_img = transforms.ColorJitter(contrast=_contrast_factor)(marked_img)

        # Clamp pixel values to [0, 1] range
        return noised_img.clamp(0, 1.)


class MedianFilter(BaseDiffNoiseModel):
    """
    A class that applies a median filter to images for noise reduction.

    The median filter is useful for removing noise while preserving edges.
    It operates by replacing each pixel's value with the median value of the
    neighboring pixels defined by a kernel.

    Attributes:
        kernel (int): The size of the kernel for the median filter (should be odd).
        prob (float): The probability of applying the median filter.
        max_step (int): The maximum number of steps for dynamic adjustment (not currently used).
    """

    def __init__(self, kernel: int = 7, prob: float = 0.8, max_step: int = 100):
        """
        Initializes the MedianFilter class with specified parameters.

        Args:
            kernel (int): The size of the kernel for the median filter (default is 7).
            prob (float): The probability of applying the median filter (default is 0.8).
            max_step (int): The maximum number of steps for dynamic adjustment (default is 100).
        """
        super(MedianFilter, self).__init__()
        self.prob = prob  # Probability of applying the median filter
        self.kernel = kernel  # Size of the median filter kernel
        self.max_step = max(max_step, 1)  # Maximum step count for dynamic adjustment (not currently used)

    def forward(self, marked_img: torch.Tensor, cover_img: torch.Tensor = None, now_step: int = 0) -> torch.Tensor:
        """
        Applies the median filter to the input marked image.

        The method randomly decides whether to apply the median filter based on the
        defined probability. If in test mode, the filter is always applied.

        Args:
            marked_img (torch.Tensor): The input image tensor to which the median filter will be applied.
            cover_img (torch.Tensor, optional): The cover image tensor (not used in this method).
            now_step (int): The current step in the training process (not currently used).

        Returns:
            torch.Tensor: The resulting image after applying the median filter.
        """
        noised_img = marked_img.clone()  # Initialize output image tensor as a clone of the input image
        # Calculate dynamic kernel size based on current step
        _kernel = int(min(now_step, self.max_step) / self.max_step * self.kernel)
        if _kernel % 2 == 0:
            _kernel += 1  # Ensure kernel size is odd

        # Apply the median filter based on the probability
        if random.uniform(0., 1.) < self.prob:
            noised_img = MedianBlur((_kernel, _kernel))(marked_img)  # Apply the median blur

        return noised_img.clamp(0, 1.)  # Clamp pixel values to [0, 1]


class Saturation(BaseDiffNoiseModel):
    def __init__(self, saturation_factor: float = 0.15, prob: float = 0.8, max_step: int = 100):
        """
        Initialize the Saturation transformation.

        Args:
            saturation_factor (float): Factor by which to adjust saturation.
                                       Should be in the range [0, ∞), where 1 means no change.
            prob (float): Probability of applying the transformation.
            max_step (int): The maximum number of steps for dynamic adjustment.
        """
        super(Saturation, self).__init__()
        self.saturation_factor = saturation_factor
        self.prob = prob
        self.max_step = max(max_step, 1)

    def forward(self, marked_img: torch.Tensor, cover_img: torch.Tensor = None, now_step: int = 0) -> torch.Tensor:
        """
        Apply the saturation transformation.

        Args:
            marked_img (torch.Tensor): The input image tensor.
            cover_img (torch.Tensor, optional): An optional cover image tensor (not used in this transform).
            now_step (int): The current step in the training process.

        Returns:
            torch.Tensor: The transformed image.
        """
        noised_img = marked_img.clone()  # Clone the input image tensor
        _saturation_factor = min(now_step, self.max_step) / self.max_step * self.saturation_factor

        # Apply the saturation transformation based on the probability
        if random.uniform(0., 1.) < self.prob:
            noised_img = transforms.ColorJitter(saturation=_saturation_factor)(marked_img)

        return noised_img.clamp(0, 1.)  # Clamp pixel values to [0, 1]


class Hue(BaseDiffNoiseModel):
    def __init__(self, hue_factor: float = 0.1, prob: float = 0.8, max_step: int = 100):
        """
        Initialize the Hue transformation.

        Args:
            hue_factor (float): Factor by which to adjust hue.
                                Should be in the range [-0.5, 0.5], where 0 means no change.
            prob (float): Probability of applying the transformation.
            max_step (int): The maximum number of steps for dynamic adjustment.
        """
        super(Hue, self).__init__()
        self.hue_factor = hue_factor
        self.prob = prob
        self.max_step = max(max_step, 1)

    def forward(self, marked_img: torch.Tensor, cover_img: torch.Tensor = None, now_step: int = 0) -> torch.Tensor:
        """
        Apply the hue transformation.

        Args:
            marked_img (torch.Tensor): The input image tensor.
            cover_img (torch.Tensor, optional): An optional cover image tensor (not used in this transform).
            now_step (int): The current step in the training process.

        Returns:
            torch.Tensor: The transformed image.
        """
        noised_img = marked_img.clone()  # Clone the input image tensor
        _hue_factor = min(now_step, self.max_step) / self.max_step * self.hue_factor

        # Apply the hue transformation based on the probability
        if random.uniform(0., 1.) < self.prob:
            noised_img = transforms.ColorJitter(hue=_hue_factor)(marked_img)

        return noised_img.clamp(0, 1.)  # Clamp pixel values to [0, 1]


class Cropout(BaseDiffNoiseModel):
    def __init__(self, remain_ratio=0.7, mode="cover_pad", constant: float = 0.0, prob: float = 1, max_step: int = 100):
        """
        Initializes the Cropout layer.

        Args:
            remain_ratio (float): The ratio of pixels to remain in the marked image.
            mode (str): The mode of operation, either 'cover_pad' or 'constant_pad'.
            constant (float): Constant value used in 'constant_pad' mode.
            prob (float): Probability of applying the Cropout operation.
            max_step (int): The maximum number of steps for dynamic adjustment.
        """
        super(Cropout, self).__init__()

        # Set mode for the dropout operation
        if mode in ["cover_pad", "constant_pad"]:
            self.mode = mode
        else:
            self.mode = "constant_pad"  # Default mode

        # Ensure constant is between 0 and 1 for 'constant_pad' mode
        if mode == "constant_pad":
            self.constant = max(min(constant, 1.), 0.)

        # Ensure remain_ratio is between 0 and 1
        self.remain_ratio = max(min(remain_ratio, 1.), 0.)
        # Ensure prob is between 0 and 1
        self.prob = max(min(prob, 1.), 0.)
        self.max_step = max(max_step, 1)

    def forward(self, marked_img: Tensor, cover_img: Tensor, now_step: int = 0) -> Tensor:
        """
        Applies the Cropout operation to the input image.

        Args:
            marked_img (Tensor): The marked image tensor.
            cover_img (Tensor): The cover image tensor.

        Returns:
            Tensor: The resulting image after applying Cropout.
        """
        noised_img = marked_img
        # Calculate the effective remain ratio based on current step
        remain_ratio = 1 - (1 - self.remain_ratio) * min(now_step, self.max_step) / self.max_step

        # Apply Cropout based on probability
        if random.uniform(0., 1.) < self.prob:
            crop_out_mask = self.random_rectangle_mask(marked_img, remain_ratio)  # Generate a cropout mask
            if self.mode == "cover_pad":
                # Replace the masked area with the cover image
                noised_img = marked_img * crop_out_mask + (1 - crop_out_mask) * cover_img
            else:
                # Replace the masked area with a constant value
                noised_img = marked_img * crop_out_mask + (1 - crop_out_mask) * self.constant

        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]

    def random_rectangle_mask(self, marked_img: Tensor, remain_ratio: float) -> torch.Tensor:
        """
        Generate a random rectangle mask that occupies a certain percentage of the image area.

        Args:
            marked_img (Tensor): Input tensor of shape (N, C, H, W), where N is the batch size,
                                 C is the number of channels, H is the height, and W is the width.

        Returns:
            Tensor: A mask of shape (N, C, H, W) with values 0 or 1, where 1 indicates the masked area.
        """
        N, C, H, W = marked_img.shape  # Get the shape of the input image tensor
        mask = torch.zeros((N, C, H, W), dtype=torch.float32)  # Initialize the mask tensor with zeros

        for i in range(N):
            # Determine the remaining ratio for the rectangle height
            _remain_ratio = remain_ratio  # Use the fixed ratio for simplicity in this implementation

            total_area = H * W  # Calculate the total area of the image (height * width)
            area_to_occupy = int(total_area * _remain_ratio)  # Calculate the area to occupy based on remain_ratio

            # Determine the range of possible heights for the rectangle
            samples = range(area_to_occupy // W, min(area_to_occupy, H) + 1)  # Height samples

            # Generate Gaussian weights based on the sample heights
            weights = torch.exp(-0.5 * ((torch.as_tensor(samples) - sum(samples) / len(samples)) ** 2) / 50.).tolist()

            # Randomly select a height based on calculated weights
            height = random.choices(samples, weights=weights)[0]  # Sample a height with weights
            width = area_to_occupy // height  # Calculate the corresponding width based on the area to occupy

            # Ensure the rectangle fits within the height and width of the image
            start_h = random.randint(0, H - height + 1)  # Randomly select the starting height position
            start_w = random.randint(0, W - width + 1)  # Randomly select the starting width position

            # Set the mask to 1 for the selected rectangle area
            mask[i, :, start_h:start_h + height, start_w:start_w + width] = 1.0

        return mask.to(marked_img.device)  # Return the mask in the same device as the input image


class Dropout(BaseDiffNoiseModel):
    def __init__(self, drop_prob=0.3, mode="cover_pad", constant: float = 0.0, prob: float = 0.8, max_step: int = 100):
        """
        Initializes the Dropout layer.

        Args:
            drop_prob (float): Probability of dropping a pixel.
            mode (str): Mode of dropout, either 'cover_pad' or 'constant_pad'.
            constant (float): Constant value used in 'constant_pad' mode.
            prob (float): Probability of applying the Dropout operation.
            max_step (int): Maximum number of steps for dynamic adjustment.
        """
        super(Dropout, self).__init__()

        # Set mode for the dropout operation
        if mode in ["cover_pad", "constant_pad"]:
            self.mode = mode
        else:
            self.mode = "cover_pad"  # Default mode

        # Ensure constant is between 0 and 1 for 'constant_pad' mode
        if mode == "constant_pad":
            self.constant = max(min(constant, 1.), 0.)

        self.max_step = max(max_step, 1)
        # Ensure drop_prob and prob are between 0 and 1
        self.drop_prob = max(min(drop_prob, 1.), 0.)
        self.prob = max(min(prob, 1.), 0.)
        # self.normalize = Normalize()  # Normalization layer (if used)

    def forward(self, marked_img: Tensor, cover_image: Tensor, now_step: int = 0) -> Tensor:
        """
        Applies dropout to the input image.

        Args:
            marked_img (Tensor): The marked image tensor.
            cover_image (Tensor): The cover image tensor.
            now_step (int): Current step to adjust drop probability.

        Returns:
            Tensor: The resulting image after applying dropout.
        """
        noised_img = marked_img  # Initialize the output image
        # Apply dropout based on the specified probability
        if random.uniform(0., 1.) < self.prob:
            # Adjust drop probability based on current step
            _drop_prob = min(now_step, self.max_step) / self.max_step * self.drop_prob
            # Create a mask based on drop probability
            mask = torch.bernoulli(torch.full(marked_img.shape, 1 - _drop_prob))
            mask_tensor = mask.to(marked_img.device).float()  # Convert mask to float and move to the correct device

            # Apply the chosen dropout mode
            if self.mode == "cover_pad":
                # Use cover image for masked pixels
                noised_img = marked_img * mask_tensor + cover_image * (1 - mask_tensor)
            else:
                # Use a constant value for masked pixels
                noised_img = marked_img * mask_tensor + self.constant * (1 - mask_tensor)

        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]


class GaussianNoise(BaseDiffNoiseModel):
    def __init__(self, mu: float = 0, std: float = 1.5, intensity: float = 0.01, prob: float = 0.8,
                 max_step: int = 100):
        """
        Initializes the GaussianNoise layer.

        Args:
            mu (float): Mean of the Gaussian noise.
            std (float): Standard deviation of the Gaussian noise.
            intensity (float): Maximum intensity of the noise.
            prob (float): Probability of applying the noise (default is 0.8).
            max_step (int): Maximum number of steps for dynamic adjustment.
        """
        super(GaussianNoise, self).__init__()
        self.mu = mu  # Mean of the Gaussian noise
        self.std = std  # Standard deviation of the Gaussian noise
        self.prob = prob  # Probability of applying the noise
        self.max_step = max(max_step, 1)  # Maximum steps for adjusting the noise standard deviation
        self.intensity = intensity  # Maximum intensity of the noise
        # self.normalize = Normalize()  # Normalization layer (if used)

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> Tensor:
        """
        Applies Gaussian noise to the input image.

        Args:
            marked_img (Tensor): The input image to which noise will be added.
            cover_img (Tensor, optional): A cover image, not used in this implementation.
            now_step (int): Current step to adjust noise standard deviation.

        Returns:
            Tensor: The noised image.
        """
        out_img = marked_img  # Initialize the output image
        # Check if noise should be applied based on the defined probability
        if random.uniform(0, 1) < self.prob:
            # Dynamically adjust the standard deviation of the noise
            _std = min(now_step, self.max_step) / self.max_step * self.std
            # Generate Gaussian noise with the adjusted standard deviation
            noise = torch.normal(self.mu, _std, size=marked_img.shape).to(marked_img.device)
            # Apply the noise to the input image
            noised_marked_img = self.intensity * noise + marked_img
            # out_img = self.normalize(noised_marked_img)  # Uncomment if normalization is needed
            out_img = noised_marked_img

        return out_img.clamp(0, 1.)  # Clamp values to [0, 1]


class SaltPepperNoise(nn.Module):
    def __init__(self, noise_ratio: float = 0.1, noise_prob: float = 0.5, prob: float = 0.8,
                 max_step: int = 100):
        """
        Initializes the SaltPepperNoise layer.

        Args:
            noise_ratio (float): Proportion of pixels to be noised (default is 0.1).
            noise_prob (float): Probability of applying "salt" (1) or "pepper" (0) to the selected pixels (default is 0.5).
            prob (float): Probability of applying the noise overall (default is 0.8).
            max_step (int): Maximum number of steps for dynamic adjustment.
        """
        super(SaltPepperNoise, self).__init__()
        self.noise_prob = max(min(noise_prob, 1.), 0.)  # Clamp noise probability between 0 and 1
        self.noise_ratio = max(min(noise_ratio, 1.), 0.)  # Clamp noise ratio between 0 and 1
        self.prob = max(min(prob, 1.), 0.)  # Clamp overall probability between 0 and 1
        self.max_step = max(max_step, 1)

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> Tensor:
        """
        Applies salt and pepper noise to the input image.

        Args:
            marked_img (Tensor): The input image to which noise will be added.
            cover_img (Tensor, optional): A cover image, not used in this implementation.
            now_step (int): Current step to adjust noise ratio.

        Returns:
            Tensor: The noised image.
        """
        noised_img = marked_img.clone()  # Avoid modifying the original image
        _noise_ratio = min(now_step, self.max_step) / self.max_step * self.noise_ratio  # Adjust noise ratio

        # Apply noise only if a random value is less than the defined probability
        if random.uniform(0, 1) < self.prob:
            # Calculate the number of pixels to which noise will be applied
            num_noisy_pixels = int(_noise_ratio * marked_img[0].numel())  # Use the first channel for pixel count

            # Generate random indices for the positions of the noisy pixels
            indices = torch.randperm(marked_img[0].numel(), device=marked_img.device)[:num_noisy_pixels]

            # Reshape the indices to match the image dimensions (height, width)
            noisy_positions = torch.unravel_index(indices, marked_img.shape[-2:])

            # Generate random values to decide between "salt" and "pepper"
            random_noise = torch.rand(num_noisy_pixels, device=marked_img.device)

            # Create salt (1) or pepper (0) values based on noise probability
            salt_pepper_values = torch.where(random_noise < self.noise_prob, torch.ones_like(random_noise),
                                             torch.zeros_like(random_noise))

            # Apply the salt and pepper noise to the selected positions in all channels
            for c in range(marked_img.shape[0]):  # Iterate over channels
                noised_img[c, noisy_positions[0], noisy_positions[1]] = salt_pepper_values

        return noised_img.clamp(0, 1)  # Clamp values to [0, 1]


class Resize(BaseDiffNoiseModel):
    """
    Resize the image using a random scaling factor.

    Args:
        scale_p (float): Minimum scale factor (0.5 to 1.0).
        prob (float): Probability of applying the resizing operation.
        mode (str): Interpolation mode, either 'nearest' or 'bilinear'.
        max_step (int): Maximum number of steps for dynamic adjustment.
    """

    def __init__(self, scale_p: float = 0.8, prob: float = 0.8, mode: str = "bilinear",
                 max_step: int = 100):
        super(Resize, self).__init__()
        # Ensure scale_p is within the range [0.5, 1.0]
        self.scale_p = max(min(scale_p, 1.), 0.5)
        self.prob = max(min(prob, 1.), 0.)  # Clamp probability between 0 and 1
        self.max_step = max(max_step, 1)
        # Set the interpolation mode, default to 'bilinear' if invalid
        if mode in ["nearest", "bilinear"]:
            self.mode = mode
        else:
            self.mode = "bilinear"  # Default mode
        # self.normalize = Normalize()  # Normalization layer (if used)

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> torch.Tensor:
        """
        Perform the resizing operation on the input image.

        Args:
            marked_img (Tensor): Input image tensor of shape (N, C, H, W).
            cover_img (Tensor, optional): Not used in this operation.
            now_step (int): Current step to adjust scale factor.

        Returns:
            Tensor: Resized image tensor of the same shape as the input.
        """
        noised_img = marked_img
        # Calculate the adjusted scale factor based on the current step
        _scale_p = 1. - (1 - self.scale_p) * min(now_step, self.max_step) / self.max_step

        # Apply resizing based on a random probability
        if random.uniform(0, 1) < self.prob:
            # Get the original height and width of the input image
            H, W = marked_img.shape[-2:]

            # Randomly determine the scaling factors for height and width
            p_h = random.randint(int(_scale_p * 1000), 1001) / 1000.  # Scale for height
            p_w = random.randint(int(_scale_p * 1000), 1001) / 1000.  # Scale for width

            # Calculate the new scaled height and width
            scaled_h = int(p_h * H)
            scaled_w = int(p_w * W)

            # Downscale the image to the new dimensions
            noised_down = F.interpolate(
                marked_img,
                size=(scaled_h, scaled_w),
                mode=self.mode
            )

            # Upscale the downscaled image back to the original dimensions
            noised_img = F.interpolate(
                noised_down,
                size=(H, W),
                mode=self.mode
            )

        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]


class Rotate(BaseDiffNoiseModel):
    def __init__(self, angle: int = 180, prob: float = 0.8, max_step: int = 100):
        """
        Initializes the Rotate layer.

        Args:
            angle (int): Maximum angle (in degrees) by which to rotate the image.
            prob (float): Probability of applying the rotation.
            max_step (int): Maximum number of steps for dynamic adjustment.
        """
        super(Rotate, self).__init__()
        # Ensure the angle is clamped between 0 and 360 degrees
        self.angle = max(min(angle, 360), 0)
        self.prob = max(min(prob, 1.), 0.)  # Clamp probability between 0 and 1
        self.max_step = max(max_step, 1)
        # self.normalize = Normalize()  # Normalization layer (if used)

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> Tensor:
        """
        Applies rotation to the input image.

        Args:
            marked_img (Tensor): The input image tensor of shape (N, C, H, W).
            cover_img (Tensor, optional): Not used in this operation.
            now_step (int): Current step to adjust rotation angle.

        Returns:
            Tensor: The resulting image after applying rotation.
        """
        noised_img = marked_img
        # Calculate the adjusted angle based on the current step
        _angle = round((min(now_step, self.max_step) / self.max_step) * self.angle)

        # Apply rotation based on a random probability
        if random.uniform(0., 1.) < self.prob:
            # Randomly determine a rotation angle from 0 to the calculated angle
            angle = random.randint(0, _angle)
            rotate = transforms.RandomRotation(angle, expand=False, center=None, fill=0)
            noised_img = rotate(marked_img)

        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]


class RandomCompensateTransformer(BaseDiffNoiseModel):
    def __init__(self, prob: float = 0.8, shift_d: int = 8, test: bool = False, max_step: int = 100):
        """
        Initializes the RandomCompensateTrans layer.

        Args:
            prob (float): Probability of applying the transformation.
            shift_d (int): Maximum displacement for the image vertices during transformation (in pixels).
            test (bool): Whether the layer is in test mode (not currently used).
            max_step (int): Maximum number of steps for dynamic adjustment.
        """
        super(RandomCompensateTransformer, self).__init__()
        self.prob = max(min(prob, 1.), 0.)  # Clamp probability between 0 and 1
        self.test = test
        self.shift_d = shift_d
        self.max_step = max(max_step, 1)
        # self.normalize = Normalize()  # Normalization layer (if used)

    def forward(self, marked_img: Tensor, cover_img: Tensor = None, now_step: int = 0) -> Tensor:
        """
        Applies a random perspective transformation to the input image.

        Args:
            marked_img (Tensor): The input image tensor of shape (N, C, H, W).
            cover_img (Tensor, optional): Not used in this operation.
            now_step (int): Current step to adjust the displacement.

        Returns:
            Tensor: The transformed image after applying the perspective transformation.
        """
        noised_img = marked_img
        if random.uniform(0., 1.) < self.prob:
            # Calculate the displacement based on the current step
            d = int(min(now_step, self.max_step) / self.max_step * self.shift_d) + 1
            noised_img = self.perspective(marked_img, d=d)

        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]

    def perspective(self, marked_img: Tensor, d: int = 8) -> Tensor:
        """
        Applies a random perspective transformation to the input batch of images.

        Args:
            marked_img (Tensor): Input batch of images, shape (N, C, H, W).
            d (int): Maximum displacement for the image vertices during transformation.

        Returns:
            Tensor: The transformed batch of images with the same shape (N, C, H, W).
        """
        N, C, H, W = marked_img.shape  # Get the batch size, channels, height, and width
        points_src = torch.ones(N, 4, 2)  # Source points (image corners), shape (N, 4, 2)
        points_dst = torch.ones(N, 4, 2)  # Destination points after displacement, shape (N, 4, 2)

        for i in range(N):
            # Set the source points as the original image corners
            points_src[i, :, :] = torch.tensor([
                [0., 0.],  # Top-left corner
                [W - 1., 0.],  # Top-right corner
                [W - 1., H - 1.],  # Bottom-right corner
                [0., H - 1.],  # Bottom-left corner
            ], dtype=torch.float32)

            # Randomly displace each corner within the range [-d, d]
            points_dst[i, 0] = [random.uniform(-d, d), random.uniform(-d, d)]  # Top-left
            points_dst[i, 1] = [random.uniform(-d, d) + W, random.uniform(-d, d)]  # Top-right
            points_dst[i, 2] = [random.uniform(-d, d) + W, random.uniform(-d, d) + H]  # Bottom-right
            points_dst[i, 3] = [random.uniform(-d, d), random.uniform(-d, d) + H]  # Bottom-left

        # Compute the perspective transformation matrix using the source and destination points
        M = kornia.geometry.get_perspective_transform(points_src, points_dst).to(marked_img.device)

        # Apply the perspective transformation to the input images
        noised_img = kornia.geometry.warp_perspective(marked_img, M, dsize=(H, W)).to(marked_img.device)

        return noised_img


class FieldOfViewTransformer(nn.Module):
    """
    A module to apply random affine and perspective transformations to a batch of images.
    The transformations include rotation, scaling, translation, and perspective warping.
    """

    def __init__(
            self,
            max_z_angle: int = 60,
            max_x_angle: int = 60,
            max_y_angle: int = 60,
            max_fov: int = 70,
            min_fov: int = 60,
            max_translate_factor: float = 0.2,
            max_plane_angle: int = 60,
    ):
        """
        Initialize the transformer with maximum transformation parameters.

        Args:
            max_z_angle (int): Maximum rotation angle around the z-axis (in degrees).
            max_x_angle (int): Maximum rotation angle around the x-axis (in degrees).
            max_y_angle (int): Maximum rotation angle around the y-axis (in degrees).
            max_fov (int): Maximum field of view (FOV) for perspective transformation (in degrees).
            min_fov (int): Minimum field of view (FOV) for perspective transformation (in degrees).
            max_translate_factor (float): Maximum translation factor as a fraction of image size.
            max_plane_angle (int): Maximum tilt angle for the plane (in degrees).
        """
        super().__init__()
        self.max_z_angle = max_z_angle
        self.max_x_angle = max_x_angle
        self.max_y_angle = max_y_angle
        self.max_fov = max_fov
        self.min_fov = min_fov
        self.max_translate_factor = max_translate_factor
        self.max_plane_angle = max_plane_angle

    def random_perspective_transform(self, img_shape, angle_xs, angle_ys, angle_zs, field_of_view):
        """
        Generate a perspective transformation matrix based on rotation angles and field of view.

        Args:
            img_shape (tuple): Shape of the input image (N, C, H, W).
            angle_xs (torch.Tensor): Rotation angles around the x-axis (in degrees).
            angle_ys (torch.Tensor): Rotation angles around the y-axis (in degrees).
            angle_zs (torch.Tensor): Rotation angles around the z-axis (in degrees).
            field_of_view (torch.Tensor): Field of view for perspective transformation (in degrees).

        Returns:
            torch.Tensor: Perspective transformation matrix of shape (N, 3, 3).
        """
        N, C, H, W = img_shape

        def rad(x):
            """Convert degrees to radians."""
            return x * np.pi / 180

        perspective_matrix = torch.zeros(size=(N, 3, 3), device=angle_xs.device)

        for i in range(N):
            fov = field_of_view[i]
            angle_x = angle_xs[i]
            angle_y = angle_ys[i]
            angle_z = angle_zs[i]
            z = np.sqrt(H ** 2 + W ** 2) / 2 / np.tan(rad(fov / 2))

            # Rotation matrices for x, y, and z axes
            rx = np.array(
                [
                    [1, 0, 0, 0],
                    [0, np.cos(rad(angle_x)), -np.sin(rad(angle_x)), 0],
                    [0, -np.sin(rad(angle_x)), np.cos(rad(angle_x)), 0],
                    [0, 0, 0, 1],
                ],
                np.float32,
            )

            ry = np.array(
                [
                    [np.cos(rad(angle_y)), 0, np.sin(rad(angle_y)), 0],
                    [0, 1, 0, 0],
                    [-np.sin(rad(angle_y)), 0, np.cos(rad(angle_y)), 0],
                    [0, 0, 0, 1],
                ],
                np.float32,
            )

            rz = np.array(
                [
                    [np.cos(rad(angle_z)), np.sin(rad(angle_z)), 0, 0],
                    [-np.sin(rad(angle_z)), np.cos(rad(angle_z)), 0, 0],
                    [0, 0, 1, 0],
                    [0, 0, 0, 1],
                ],
                np.float32,
            )

            # Combined rotation matrix
            r = rx.dot(ry).dot(rz)

            # Define source corners (shape: (4, 2), dtype: float32)
            p_center = np.array([W / 2, H / 2, 0, 0], np.float32)
            p1 = np.array([0, 0, 0, 0], np.float32) - p_center
            p2 = np.array([H, 0, 0, 0], np.float32) - p_center
            p3 = np.array([0, W, 0, 0], np.float32) - p_center
            p4 = np.array([H, W, 0, 0], np.float32) - p_center

            # Transform corners using rotation matrix
            dst1 = r.dot(p1)
            dst2 = r.dot(p2)
            dst3 = r.dot(p3)
            dst4 = r.dot(p4)

            list_dst = [dst1, dst2, dst3, dst4]
            org = np.array([[0, 0], [H - 1, 0], [0, W - 1], [H - 1, W - 1]], np.float32)
            dst = np.zeros((4, 2), np.float32)

            for j in range(4):
                dst[j, 0] = list_dst[j][0] * z / (z - list_dst[j][2]) + p_center[0]
                dst[j, 1] = list_dst[j][1] * z / (z - list_dst[j][2]) + p_center[1]

            # Compute perspective transformation matrix using OpenCV
            org_tensor = torch.as_tensor(org, dtype=torch.float32).unsqueeze(0)
            dst_tensor = torch.as_tensor(dst, dtype=torch.float32).unsqueeze(0)
            warpR = kornia.geometry.get_perspective_transform(org_tensor, dst_tensor)
            perspective_matrix[i] = warpR[0].to(angle_xs.device)

        return perspective_matrix

    def transform_points(self, pts, matrix):
        """
        Transform 2D points using a 3x3 transformation matrix.

        Args:
            pts (torch.Tensor): Original points of shape (N, 4, 2).
            matrix (torch.Tensor): Transformation matrix of shape (N, 3, 3).

        Returns:
            torch.Tensor: Transformed points of shape (N, 4, 2).
        """
        homogenous_points = torch.cat((pts, torch.ones((pts.shape[0], pts.shape[1], 1), device=pts.device)), dim=2)
        transformed_homogeneous = torch.bmm(matrix, homogenous_points.permute(0, 2, 1))
        transformed_points = transformed_homogeneous.permute(0, 2, 1)[:, :, :2] / transformed_homogeneous.permute(0, 2,
                                                                                                                  1)[:,
                                                                                  :, 2:]
        return transformed_points

    def forward(self, batch_img: Tensor, current_step: int, reset_step: int, batch_img_mask: Tensor = None,
                scale_factor: float = 1.2):
        """
        Apply random affine and perspective transformations to the input batch of images.

        Args:
            batch_img (torch.Tensor): Input batch of images of shape (N, C, H, W).
            current_step (int): Current step in the transformation schedule.
            reset_step (int): Step interval for resetting the transformation parameters.
            batch_img_mask (torch.Tensor, optional): Optional mask for the input images of shape (N, C, H, W).

        Returns:
            tuple: A tuple containing:
                - warped_images (torch.Tensor): Transformed images of shape (N, C, H, W).
                - warped_masks (torch.Tensor): Transformed masks of shape (N, C, H, W).
                - warped_corners (torch.Tensor): Transformed corner points of shape (N, 4, 2).
                :param scale_factor:
        """
        N, C, H, W = batch_img.shape
        min_size = min(H, W)
        self.max_scale_factor = min_size / np.sqrt(H ** 2 + W ** 2) * scale_factor

        assert self.max_fov > self.min_fov
        assert self.max_x_angle > 0
        assert self.max_y_angle > 0
        assert self.max_z_angle > 0
        assert self.max_plane_angle > 0

        if batch_img_mask is None:
            batch_img_mask = torch.ones_like(batch_img)

        # Source points (corners of the image)
        src_pts = torch.tensor([[[0.0, 0.0], [H - 1, 0.0], [0.0, W - 1], [H - 1, W - 1]]],
                               device=batch_img.device).repeat(N, 1, 1)
        centers = torch.tensor([[H / 2.0, W / 2.0]], device=batch_img.device).repeat(N, 1)

        # Calculate transformation ratio based on the current step
        current_step = current_step % reset_step
        step_ratio = 1 / (1 + np.exp(-(((current_step - 0) / (reset_step - 0)) * 15 - 7.5)))

        # Parameters for affine transformation
        max_scale_f = int(self.max_scale_factor * reset_step)
        min_scale_f = int(max_scale_f - (max_scale_f / 2) * step_ratio)
        now_scale_factor = torch.randint(low=min_scale_f, high=max_scale_f, size=(N, 1), dtype=torch.float32,
                                         device=batch_img.device).repeat(1, 2) / reset_step

        max_trans_f = self.max_translate_factor
        min_trans_f = max_trans_f * (1.0 - step_ratio)
        now_trans_factor = (torch.randint(0, 2, size=(N, 1), device=batch_img.device) - 1) * torch.randint(
            low=int(min_trans_f * H) - 1, high=int(max_trans_f * W) + 1, size=(N, 2), dtype=torch.float32,
            device=batch_img.device
        )

        max_plane_angle_f = self.max_plane_angle
        min_plane_angle_f = max_plane_angle_f * (1.0 - step_ratio)
        now_plane_angle_factor = torch.randint(
            low=int(min_plane_angle_f), high=int(max_plane_angle_f), size=(N,), dtype=torch.float32,
            device=batch_img.device
        )

        # Apply affine transformation
        affine_matrix = kornia.geometry.get_affine_matrix2d(now_trans_factor, centers, now_scale_factor,
                                                            now_plane_angle_factor)
        affine_img = kornia.geometry.warp_perspective(batch_img, affine_matrix, dsize=(H, W))
        affine_img_mask = kornia.geometry.warp_perspective(batch_img_mask, affine_matrix, dsize=(H, W))
        affine_pts = self.transform_points(src_pts, affine_matrix)

        # Parameters for perspective transformation
        max_dx_f = int(self.max_x_angle * step_ratio)
        min_dx_f = 0
        now_dx_factor = (torch.randint(0, 2, size=(N,), device=batch_img.device) - 1) * torch.randint(
            min_dx_f, max_dx_f + 1, size=(N,), device=batch_img.device
        )

        max_dy_f = int(self.max_y_angle * step_ratio)
        min_dy_f = 0
        now_dy_factor = (torch.randint(0, 2, size=(N,), device=batch_img.device) - 1) * torch.randint(
            min_dy_f, max_dy_f + 1, size=(N,), device=batch_img.device
        )

        max_dz_f = int(self.max_z_angle * step_ratio)
        min_dz_f = 0
        now_dz_factor = (torch.randint(0, 2, size=(N,), device=batch_img.device) - 1) * torch.randint(
            min_dz_f, max_dz_f + 1, size=(N,), device=batch_img.device
        )

        max_fov_f = self.max_fov
        min_fov_f = self.min_fov
        now_fov_factor = torch.randint(min_fov_f, max_fov_f, size=(N,), dtype=torch.float32, device=batch_img.device)

        # Apply perspective transformation
        perspective_matrix = self.random_perspective_transform(batch_img.shape, now_dx_factor, now_dy_factor,
                                                               now_dz_factor, now_fov_factor)
        warped_img = kornia.geometry.warp_perspective(affine_img, perspective_matrix, dsize=(H, W))
        warped_pts = self.transform_points(affine_pts, perspective_matrix)
        warped_img_mask = kornia.geometry.warp_perspective(affine_img_mask, perspective_matrix, dsize=(H, W))

        return warped_img, warped_img_mask, warped_pts


class DiffJpeg(nn.Module):
    def __init__(self, Q: int, round_mode="mask_round"):
        super().__init__()
        self.Q = Q
        self.factor = None
        self.init_params()
        self.round_mode = round_mode

    def forward(self, marked_img: Tensor):
        """

        """
        y_cb_cr_quantized = self.compress_jpeg(marked_img * 255.)
        noised_img = self.decompress_jpeg(y_cb_cr_quantized, marked_img) / 255.
        return noised_img

    def init_params(self):
        if self.Q < 50:
            quality = 5000. / self.Q
        else:
            quality = 200. - self.Q * 2
        self.factor = quality / 100.

        self.rgb2ycbcr_matrix = nn.Parameter(torch.as_tensor([[0.299, 0.587, 0.114],
                                                              [-0.168736, -0.331264, 0.5],
                                                              [0.5, -0.418688, -0.081312]], dtype=torch.float32).T)
        self.rgb2ycbcr_shift = nn.Parameter(torch.tensor([0., 128., 128.]))
        dct_tensor = np.zeros((8, 8, 8, 8), dtype=np.float32)
        for x, y, u, v in itertools.product(range(8), repeat=4):
            dct_tensor[x, y, u, v] = np.cos((2 * x + 1) * u * np.pi / 16) * np.cos((2 * y + 1) * v * np.pi / 16)
        dct_alpha = np.array([1. / np.sqrt(2)] + [1] * 7)
        self.dct_tensor = nn.Parameter(torch.from_numpy(dct_tensor).float())
        self.scale = nn.Parameter(torch.from_numpy(np.outer(dct_alpha, dct_alpha) * 0.25).float())
        y_table = np.array([[16, 11, 10, 16, 24, 40, 51, 61],
                            [12, 12, 14, 19, 26, 58, 60, 55],
                            [14, 13, 16, 24, 40, 57, 69, 56],
                            [14, 17, 22, 29, 51, 87, 80, 62],
                            [18, 22, 37, 56, 68, 109, 103, 77],
                            [24, 35, 55, 64, 81, 104, 113, 92],
                            [49, 64, 78, 87, 103, 121, 120, 101],
                            [72, 92, 95, 98, 112, 100, 103, 99]], dtype=np.float32).T

        self.y_table = nn.Parameter(torch.from_numpy(y_table))
        c_table = np.empty((8, 8), dtype=np.float32)
        c_table.fill(99)
        c_table[:4, :4] = np.array([[17, 18, 24, 47], [18, 21, 26, 66],
                                    [24, 26, 56, 99], [47, 66, 99, 99]]).T
        self.c_table = nn.Parameter(torch.from_numpy(c_table))

        idct_alpha = np.array([1. / np.sqrt(2)] + [1] * 7)
        self.alpha = nn.Parameter(torch.from_numpy(np.outer(idct_alpha, idct_alpha)).float())
        idct_tensor = np.zeros((8, 8, 8, 8), dtype=np.float32)
        for x, y, u, v in itertools.product(range(8), repeat=4):
            idct_tensor[x, y, u, v] = np.cos((2 * u + 1) * x * np.pi / 16) * np.cos((2 * v + 1) * y * np.pi / 16)
        self.idct_tensor = nn.Parameter(torch.from_numpy(idct_tensor).float())

        self.ycbcr2rgb_matrix = nn.Parameter(torch.as_tensor([[1., 0., 1.402],
                                                              [1, -0.344136, -0.714136],
                                                              [1, 1.772, 0]], dtype=torch.float32)).T
        self.ycbcr2rgb_shift = nn.Parameter(torch.tensor([0, -128., -128.]))

    def compress_jpeg(self, marked_img: Tensor):
        y_cb_cr = self.rgb2ycbcr(marked_img)
        sub_sampled_y_cb_cr = self.chroma_subsampling(y_cb_cr)
        y_cb_cr_blocks = self.block_splitting(sub_sampled_y_cb_cr)
        y_cb_cr_dct_blocks = self.dct_8x8(y_cb_cr_blocks)
        y_cb_cr_quantized = self.quantize(y_cb_cr_dct_blocks)
        return y_cb_cr_quantized

    def rgb2ycbcr(self, marked_img: Tensor):
        if marked_img.shape[1] > 1:
            image = marked_img.permute(0, 2, 3, 1)
            y_cb_cr = torch.tensordot(image, self.rgb2ycbcr_matrix.to(marked_img.device),
                                      dims=1) + self.rgb2ycbcr_shift.to(marked_img.device)
            y_cb_cr = y_cb_cr.view(image.shape).permute(0, 3, 1, 2)
            result = {"y": y_cb_cr[:, 0, :, :].unsqueeze(1),
                      "cb": y_cb_cr[:, 1, :, :].unsqueeze(1),
                      "cr": y_cb_cr[:, 2, :, :].unsqueeze(1)}
        else:
            result = {"y": marked_img}
        return result

    def chroma_subsampling(self, y_cb_cr: dict):
        avg_pool = nn.AvgPool2d(kernel_size=2, stride=(2, 2), count_include_pad=False)
        subsampled_y_cb_cr = y_cb_cr.copy()
        for k in y_cb_cr.keys():
            if k in ["cb", "cr"]:
                subsampled_y_cb_cr[k] = avg_pool(y_cb_cr[k])
        return subsampled_y_cb_cr

    def block_splitting(self, subsampled_y_cb_cr: dict, k: int = 8):
        blocks_y_cb_cr = subsampled_y_cb_cr.copy()
        for key in subsampled_y_cb_cr.keys():
            channel = subsampled_y_cb_cr[key].permute(0, 2, 3, 1)
            N, H, W, C = channel.shape
            image_reshaped = channel.view(N, H // k, k, -1, k)
            image_transposed = image_reshaped.permute(0, 1, 3, 2, 4)
            blocks = image_transposed.contiguous().view(N, -1, k, k)
            blocks_y_cb_cr[key] = blocks
        return blocks_y_cb_cr

    def dct_8x8(self, blocks_y_cb_cr):
        dct_blocks_y_cb_cr = blocks_y_cb_cr.copy()
        for k in blocks_y_cb_cr.keys():
            channel = blocks_y_cb_cr[k]
            channel = channel - 128
            dct_channel = self.scale.to(channel.device) * torch.tensordot(channel, self.dct_tensor.to(channel.device),
                                                                          dims=2).view(channel.shape)
            dct_blocks_y_cb_cr[k] = dct_channel
        return dct_blocks_y_cb_cr

    def quantize(self, dct_blocks_y_cb_cr):
        quantized_dct_blocks_y_cb_cr = dct_blocks_y_cb_cr.copy()
        for k in dct_blocks_y_cb_cr.keys():
            channel = dct_blocks_y_cb_cr[k]
            if k == "y":
                q_channel = channel / (self.y_table.to(channel.device) * self.factor)
                if self.round_mode == "mask_round":
                    q_channel = self.mask_round_y(q_channel)
                else:
                    q_channel = self.diff_round(q_channel)
            else:
                q_channel = channel / (self.c_table.to(channel.device) * self.factor)
                if self.round_mode == "mask_round":
                    q_channel = self.mask_round_uv(q_channel)
                else:
                    q_channel = self.diff_round(q_channel)
            quantized_dct_blocks_y_cb_cr[k] = q_channel
        return quantized_dct_blocks_y_cb_cr

    def diff_round(self, input_tensor):
        fourier = 0
        for n in range(1, 10):
            fourier += math.pow(-1, n + 1) / n * torch.sin(2 * math.pi * n * input_tensor)
        final_tensor = input_tensor - 1 / math.pi * fourier
        return final_tensor

    def mask_round_y(self, input_tensor):
        mask = torch.zeros(1, 1, 8, 8).to(input_tensor.device)
        mask[:, :, :5, :5] = 1.
        return input_tensor * mask

    def mask_round_uv(self, input_tensor):
        mask = torch.zeros(1, 1, 8, 8).to(input_tensor.device)
        mask[:, :, :3, :3] = 1.
        return input_tensor * mask

    def decompress_jpeg(self, y_cb_cr_quantized: dict, marked_img: Tensor):
        y_cb_cr_de_quantized = self.de_quantize(y_cb_cr_quantized)
        y_cb_cr_i_dct = self.idct_8x8(y_cb_cr_de_quantized)
        y_cb_cr_merged = self.blocks_merging(y_cb_cr_i_dct, marked_img)
        y_cb_cr_merged = self.chroma_upsampling(y_cb_cr_merged)
        rgb = self.ycbcr2rgb(y_cb_cr_merged)
        return rgb

    def de_quantize(self, y_cb_cr_quantized):
        y_cb_cr_dequantized = y_cb_cr_quantized.copy()
        for k in y_cb_cr_quantized.keys():
            channel = y_cb_cr_dequantized[k]
            if k == "y":
                de_q_channel = channel * (self.y_table.to(channel.device) * self.factor)
            else:
                de_q_channel = channel * (self.c_table.to(channel.device) * self.factor)
            y_cb_cr_dequantized[k] = de_q_channel
        return y_cb_cr_dequantized

    def idct_8x8(self, y_cb_cr_dequantized):
        y_cb_cr_dequantized_idct = y_cb_cr_dequantized.copy()
        for k in y_cb_cr_dequantized.keys():
            channel = y_cb_cr_dequantized[k]
            channel = channel * self.alpha.to(channel.device)
            idct_channel = 0.25 * torch.tensordot(channel, self.idct_tensor.to(channel.device), dims=2) + 128
            idct_channel = idct_channel.view(channel.shape)
            y_cb_cr_dequantized_idct[k] = idct_channel
        return y_cb_cr_dequantized_idct

    def blocks_merging(self, y_cb_cr_idct_blocks, marked_img: Tensor, k: int = 8):
        y_cb_cr_idct_imgs = y_cb_cr_idct_blocks.copy()
        for key in y_cb_cr_idct_blocks.keys():
            channel = y_cb_cr_idct_blocks[key]
            N, C, H, W = marked_img.shape
            if key in ["cb", "cr"]:
                H, W = H // 2, W // 2
            image_reshaped = channel.view(N, H // k, W // k, k, k)
            image_transposed = image_reshaped.permute(0, 1, 3, 2, 4)
            channel_img = image_transposed.contiguous().view(N, H, W)
            y_cb_cr_idct_imgs[key] = channel_img
        return y_cb_cr_idct_imgs

    def chroma_upsampling(self, y_cb_cr_idct_imgs, k: int = 2):
        y_cb_cr_idct_unsample_imgs = y_cb_cr_idct_imgs.copy()
        for key in y_cb_cr_idct_imgs.keys():
            if key in ["cb", "cr"]:
                channel_idct = y_cb_cr_idct_imgs[key]
                channel = channel_idct.unsqueeze(-1)
                channel = channel.repeat(1, 1, k, k)
                channel = channel.view(-1, channel_idct.shape[1] * k, channel_idct.shape[2] * k)
                y_cb_cr_idct_unsample_imgs[key] = channel
        return y_cb_cr_idct_unsample_imgs

    def ycbcr2rgb(self, y_cb_cr_idct_unsample_imgs: dict):
        channel_len = len(y_cb_cr_idct_unsample_imgs)
        if channel_len == 1:
            rgb = y_cb_cr_idct_unsample_imgs["y"].unsqueeze(1)
            return rgb
        else:
            y = y_cb_cr_idct_unsample_imgs["y"].unsqueeze(3)
            cb = y_cb_cr_idct_unsample_imgs["cb"].unsqueeze(3)
            cr = y_cb_cr_idct_unsample_imgs["cr"].unsqueeze(3)
            cat_y_cb_cr = torch.cat([y, cb, cr], dim=3)
            rgb = torch.tensordot(cat_y_cb_cr + self.ycbcr2rgb_shift.to(cat_y_cb_cr.device),
                                  self.ycbcr2rgb_matrix.to(cat_y_cb_cr.device), dims=1)
            rgb = rgb.view(cat_y_cb_cr.shape).permute(0, 3, 1, 2)
            return rgb


class Jpeg(BaseDiffNoiseModel):
    def __init__(self, Q: int = 50, max_step: int = 100, round_mode="mask_round"):
        """
        Initialize the Jpeg module.

        Args:
            Q (int): JPEG quality factor, clamped between 50 and 100.
            max_step (int): Maximum number of steps for quality adjustment.
            round_mode (str): Rounding mode for quantization.
        """
        super(Jpeg, self).__init__()
        self.Q = min(max(50, Q), 100)  # Clamp quality factor to [50, 100]
        self.max_step = max(max_step, 1)  # Store maximum step
        self.round_mode = round_mode  # Set rounding mode

    def gamma_density(self, Q, shape=2.0, scale=1.0):
        """
        Calculate gamma density for quality adjustment.

        Args:
            Q (int): Quality factor.
            shape (float): Shape parameter for the gamma distribution.
            scale (float): Scale parameter for the gamma distribution.

        Returns:
            List[float]: List of gamma density values.
        """
        values = torch.arange(Q, 100, dtype=torch.float32)  # Create range of quality values
        gamma_dist = torch.distributions.Gamma(concentration=shape, rate=1.0 / scale)  # Create gamma distribution
        gamma_density = gamma_dist.log_prob(values).exp()  # Compute gamma density
        return gamma_density.tolist()  # Return as list

    def forward(self, marked_img: Tensor, cover_img=None, now_step: int = 0):
        """
        Forward pass for JPEG processing with dynamic quality adjustment.

        Args:
            marked_img (Tensor): Input image tensor.
            cover_img (Tensor, optional): Cover image tensor (unused).
            now_step (int): Current step for quality adjustment.

        Returns:
            Tensor: Noised image tensor after JPEG processing.
        """
        # Calculate dynamic quality factor based on current step
        _Q = 100 - int((100 - self.Q) * min(now_step, self.max_step) / self.max_step) - 1
        # Uncomment the following lines if weighted sampling is needed
        # weights = self.gamma_density(_Q - 1)
        # Q_list = range(_Q - 1, 100)
        # _Q = random.choices(Q_list, weights=weights)[0]

        # Process the marked image with DiffJpeg
        noised_img = DiffJpeg(_Q, round_mode=self.round_mode)(marked_img)
        return noised_img.clamp(0, 1.)  # Clamp values to [0, 1]


class ScreenCapture(BaseDiffNoiseModel):
    def __init__(self):
        """
        ScreenCapture Class simulates screen-shooting noise, including light distortion and Moire patterns.

        This noiselayer is proposed by the work in:
        H. Fang, Z. Jia, Z. Ma, E. Chang, and W. Zhang.
        PIMoG: An Effective Screen-shooting Noise-Layer Simulation for Deep-Learning-Based Watermarking Network.
        Proceedings of the 30th ACM International Conference on Multimedia (ACM MM), 2022.

        [Code]: https://github.com/FangHanNUS/PIMoG-An-Effective-Screen-shooting-Noise-Layer-Simulation-for-Deep-Learning-Based-Watermarking-Netw/
        """
        super(ScreenCapture, self).__init__()

    # Generate Moire pattern based on polar coordinates
    def MoireGen(self, p_size, theta, center_x, center_y):
        """
        Generates a Moire pattern with specified parameters, simulating the screen capture effect.

        Args:
            p_size (int): Size of the generated pattern.
            theta (float): Rotation angle in degrees.
            center_x (float): X-coordinate of the pattern center.
            center_y (float): Y-coordinate of the pattern center.

        Returns:
            M (numpy array): Generated Moire pattern matrix.
        """
        z = np.zeros((p_size, p_size))
        for i in range(p_size):
            for j in range(p_size):
                # Calculate radial and linear cosine components to simulate Moire pattern
                z1 = 0.5 + 0.5 * math.cos(2 * math.pi * np.sqrt((i + 1 - center_x) ** 2 + (j + 1 - center_y) ** 2))
                z2 = 0.5 + 0.5 * math.cos(
                    math.cos(theta / 180 * math.pi) * (j + 1) + math.sin(theta / 180 * math.pi) * (i + 1))
                z[i, j] = np.min([z1, z2])
        M = (z + 1) / 2
        return M

    # Light distortion simulation
    def Light_Distortion(self, c, embed_image):
        """
        Simulates light distortion over an embedded image by altering brightness gradients or introducing radial distortion.

        Args:
            c (int): Random selection parameter to choose between gradient or radial distortion.
            embed_image (Tensor): The input image with the embedded watermark.

        Returns:
            O (numpy array): Light distortion mask applied to the image.
        """
        mask = np.zeros((embed_image.shape))
        mask_2d = np.zeros((embed_image.shape[2], embed_image.shape[3]))
        a = 0.7 + np.random.rand(1) * 0.2
        b = 1.1 + np.random.rand(1) * 0.2

        if c == 0:
            direction = np.random.randint(1, 5)
            for i in range(embed_image.shape[2]):
                mask_2d[i, :] = -((b - a) / (mask.shape[2] - 1)) * (i - mask.shape[3]) + a
            O = np.rot90(mask_2d, direction - 1)  # Rotating mask based on random direction
            for batch in range(embed_image.shape[0]):
                for channel in range(embed_image.shape[1]):
                    mask[batch, channel, :, :] = mask_2d
        else:
            # Radial light distortion based on random center
            x = np.random.randint(0, mask.shape[2])
            y = np.random.randint(0, mask.shape[3])
            max_len = np.max(
                [np.sqrt(x ** 2 + y ** 2), np.sqrt((x - 255) ** 2 + y ** 2), np.sqrt(x ** 2 + (y - 255) ** 2),
                 np.sqrt((x - 255) ** 2 + (y - 255) ** 2)])
            for i in range(mask.shape[2]):
                for j in range(mask.shape[3]):
                    mask[:, :, i, j] = np.sqrt((i - x) ** 2 + (j - y) ** 2) / max_len * (a - b) + b
            O = mask
        return O

    # Moire distortion simulation
    def Moire_Distortion(self, embed_image):
        """
        Simulates Moire distortion on the embedded image by generating multiple Moire patterns.

        Args:
            embed_image (Tensor): The input image with the embedded watermark.

        Returns:
            Z (numpy array): Moire distortion pattern applied to the image.
        """
        Z = np.zeros((embed_image.shape))
        for i in range(3):  # Apply Moire pattern on each channel
            theta = np.random.randint(0, 180)
            center_x = np.random.rand(1) * embed_image.shape[2]
            center_y = np.random.rand(1) * embed_image.shape[3]
            M = self.MoireGen(embed_image.shape[2], theta, center_x, center_y)
            Z[:, i, :, :] = M
        return Z

    def forward(self, embed_image, cover_img: Tensor, now_step: int = 0):
        """
        Applies combined light distortion and Moire distortion to the input image.

        Args:
            embed_image (Tensor): The input image with the embedded watermark.
            cover_img (Tensor): The original cover image (not used in current implementation).

        Returns:
            noised_image (Tensor): The distorted image after applying noise layers.
        """
        # Randomly select distortion method (light gradient or radial)
        c = np.random.randint(0, 2)
        L = self.Light_Distortion(c, embed_image)
        Z = self.Moire_Distortion(embed_image) * 2 - 1  # Scale Moire pattern

        # Copy distortions and apply to the embedded image
        Li = L.copy()
        Mo = Z.copy()
        noised_image = embed_image * torch.from_numpy(Li).to(embed_image.device) * 0.85 + torch.from_numpy(Mo).to(
            embed_image.device) * 0.15

        # Gaussian noise
        noised_image = noised_image + 0.001 ** 0.5 * torch.randn(noised_image.size()).to(embed_image.device)
        return noised_image.clamp(0, 1.).to(embed_image.dtype)
