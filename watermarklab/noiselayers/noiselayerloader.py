import torch
import random
from torch import nn
from watermarklab.noiselayers.diffdistortions import *



class DigitalDistortion(nn.Module):
    """
    A class that applies various digital distortion effects to images.

    This class supports dynamic adjustment of the number of distortions applied
    to a marked image based on the current training step. It provides two modes
    for adjusting the number of applied noise layers: 'parabolic' and 'stair'.

    Attributes:
        max_step (int): Maximum number of steps for training, controlling distortion application.
        k_min (int): Minimum number of distortions to apply.
        k_max (int): Maximum number of distortions to apply.
        noise_layers (dict): A dictionary of noise layer instances.
    """

    def __init__(self, noise_dict: dict, max_step: int = 100, k_min: int = 1, k_max: int = 2):
        """
        Initializes the DigitalDistortion class.

        Args:
            noise_dict (dict): A dictionary specifying the noise layers to include.
                               Keys are layer names, and values are their parameters.
            max_step (int): The maximum number of training steps. Default is 100.
            k_min (int): The minimum number of noise layers to apply. Default is 1.
            k_max (int): The maximum number of noise layers to apply. Default is 2.
        """
        super(DigitalDistortion, self).__init__()
        self.max_step = max_step
        self.k_max = min(k_max, len(noise_dict))
        self.k_min = k_min

        self.noise_dict = noise_dict
        # Predefined noise layers
        self.noise_layers = dict()
        for key in noise_dict.keys():
            if key == "Jpeg":
                self.noise_layers["Jpeg"] = Jpeg(max_step=max_step, Q=noise_dict[key])
            if key == "Resize":
                self.noise_layers["Resize"] = Resize(max_step=max_step, scale_p=noise_dict[key])
            if key == "GaussianBlur":
                self.noise_layers["GaussianBlur"] = GaussianBlur(max_step=max_step,
                                                                 sigmas=(noise_dict[key], noise_dict[key]))
            if key == "GaussianNoise":
                self.noise_layers["GaussianNoise"] = GaussianNoise(max_step=max_step, std=noise_dict[key])
            if key == "Brightness":
                self.noise_layers["Brightness"] = Brightness(max_step=max_step, brightness_factor=noise_dict[key])
            if key == "Contrast":
                self.noise_layers["Contrast"] = Contrast(max_step=max_step, contrast_factor=noise_dict[key])
            if key == "Saturation":
                self.noise_layers["Saturation"] = Saturation(max_step=max_step, saturation_factor=noise_dict[key])
            if key == "Hue":
                self.noise_layers["Hue"] = Hue(max_step=max_step, hue_factor=noise_dict[key])
            if key == "Rotate":
                self.noise_layers["Rotate"] = Rotate(max_step=max_step, angle=noise_dict[key])
            if key == "SaltPepperNoise":
                self.noise_layers["SaltPepperNoise"] = SaltPepperNoise(max_step=max_step, noise_ratio=noise_dict[key])
            if key == "MedianFilter":
                self.noise_layers["MedianFilter"] = MedianFilter(max_step=max_step, kernel=noise_dict[key])
            if key == "Cropout":
                self.noise_layers["Cropout"] = Cropout(max_step=max_step, remain_ratio=noise_dict[key])
            if key == "Dropout":
                self.noise_layers["Dropout"] = Dropout(max_step=max_step, drop_prob=noise_dict[key])
            if key == "Identity":
                self.noise_layers["Identity"] = Identity(max_step=max_step)
            if key == "RandomCompensateTrans":
                self.noise_layers["RandomCompensateTrans"] = RandomCompensateTransformer(max_step=max_step, shift_d=noise_dict[key])

    def stair_k(self, now_step: int) -> int:
        """
        Determines the number of noise layers to apply using a stair-step approach.

        Args:
            now_step (int): Current step in the training process.

        Returns:
            int: Number of noise layers to apply.
        """
        total_steps = self.k_max
        max_steps_per_k = self.max_step / total_steps
        step_index = int(now_step // max_steps_per_k)
        k = self.k_min + step_index
        return min(k, self.k_max)

    def parabolic_k(self, now_step: int, gamma: float = 1.3) -> int:
        """
        Determines the number of noise layers to apply using a parabolic approach.

        Args:
            now_step (int): Current step in the training process.
            gamma (float): Parameter that controls the curvature of the parabola.

        Returns:
            int: Number of noise layers to apply, clamped to a minimum of 1.
        """
        factor = 1.0 if now_step > self.max_step else (now_step / self.max_step) ** gamma
        k = self.k_min + (self.k_max - self.k_min) * factor
        return max(1, int(k))

    def forward(self, marked_img: torch.Tensor, cover_img: torch.Tensor, now_step: int = 0) -> torch.Tensor:
        """
        Applies a random selection of noise layers to the input image.

        Args:
            marked_img (torch.Tensor): The image tensor to which distortions are applied.
            cover_img (torch.Tensor): The cover image tensor used for certain distortions.
            now_step (int): Current step in the training process.

        Returns:
            torch.Tensor: The distorted image tensor with values clamped to the range [0, 1].
        """
        # Determine the number of noise layers to apply
        k = self.stair_k(now_step)

        # Select random noise layers
        selected_keys = random.sample(list(self.noise_layers.keys()), k)

        # Apply selected noise layers sequentially
        noised_img = marked_img
        for key in selected_keys:
            noised_img = self.noise_layers[key](noised_img, cover_img, now_step)
        return noised_img.clamp(0, 1)  # Clamp pixel values to ensure valid range


# Execute the test
if __name__ == "__main__":
    pass
