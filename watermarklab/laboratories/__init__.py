import glob
import json
import math
import os.path
import threading
import numpy as np
from PIL import Image
from tqdm import tqdm
from typing import List, Tuple
from watermarklab.metrics import *
from watermarklab.utils.basemodel import *

__all__ = ['WLab']

from watermarklab.utils.data import DataLoader, DecodeDataLoader


class WLab:
    """
    Main class for conducting watermarking experiments. This class handles the entire workflow,
    including encoding, adding noise, decoding, and evaluating the performance of watermarking models.
    """

    def __init__(self, save_path: str,
                 noise_models: List[NoiseModelWithFactors],
                 vqmetrics=None,
                 robustnessmetrics=None,
                 num_iterations: int = 10):
        """
        Initializes the WLab class with the necessary parameters for conducting experiments.

        :param save_path: Path to save experiment results.
        :param noise_models: List of noise models to apply during the experiment.
        :param vqmetrics: List of visual quality metrics to compute.
        :param robustnessmetrics: List of robustness metrics to compute.
        :param num_iterations: Number of iterations per experiment.
        """
        if vqmetrics is None:
            vqmetrics = []
        if robustnessmetrics is None:
            robustnessmetrics = []
        self.save_path = save_path
        self.num_iterations = num_iterations
        self.noise_models = noise_models
        if psnr not in vqmetrics:
            vqmetrics.append(psnr)
        if ssim not in vqmetrics:
            vqmetrics.append(ssim)
        self.vqmetrics = vqmetrics
        if ber not in robustnessmetrics:
            robustnessmetrics.append(ber)
        if extract_accuracy not in robustnessmetrics:
            robustnessmetrics.append(extract_accuracy)
        self.robustnessmetrics = robustnessmetrics

    def _encode(self, watermark_model: BaseWatermarkModel, dataloader: DataLoader):
        """
        Encodes the watermark into the cover images and saves the results. This method is responsible
        for embedding the secret bits into the cover images and saving the stego images, residuals,
        and other related data.

        :param watermark_model: The watermarking model to use for encoding.
        :param dataset: The dataset containing cover images and secret bits.
        """
        now_model_save_path = os.path.join(self.save_path, f"{watermark_model.modelname}/images")
        os.makedirs(now_model_save_path, exist_ok=True)

        # Use tqdm to show progress during encoding
        tar = tqdm(enumerate(dataloader), desc=f"Model {watermark_model.modelname} Encoding", total=len(dataloader))
        for index, (cover_list, secret_list, img_indexes, iter_indexes) in tar:
            tar.set_description(desc=f"Model {watermark_model.modelname} Encoding - batchsize {index + 1}")
            stego_list = watermark_model.embed(cover_list, secret_list).stego_img
            for stego, cover, secret, img_index, iter_index in zip(stego_list, cover_list, secret_list, img_indexes, iter_indexes):
                save_iter_path = os.path.join(now_model_save_path, f"image_{img_index + 1}", f"iter_{iter_index + 1}")
                os.makedirs(save_iter_path, exist_ok=True)
                residual = np.abs(cover - stego)
                residual_normal = ((residual - np.min(residual)) / (np.max(residual) - np.min(residual))) * 255.
                Image.fromarray(cover.astype(np.uint8)).save(os.path.join(save_iter_path, f"cover.png"))
                Image.fromarray(stego.astype(np.uint8)).save(os.path.join(save_iter_path, f"stego.png"))
                Image.fromarray(residual_normal.astype(np.uint8)).save(os.path.join(save_iter_path, f"residual.png"))
                secret2list, watermark_visual = self._reshape_secret(secret)
                Image.fromarray(watermark_visual.astype(np.uint8)).save(os.path.join(save_iter_path, f"secret.bmp"))
                with open(os.path.join(save_iter_path, f"secret.json"), 'w') as f:
                    json.dump(secret2list, f)

    def _addnoise(self, watermark_model: BaseWatermarkModel,
                  cover_stego_paths_pair: Tuple[List[List[str]], List[List[str]]]):
        """
        Applies noise to the stego images and saves the results. This method is responsible for
        applying various noise models to the stego images to test the robustness of the watermarking algorithm.

        :param watermark_model: The watermarking model used.
        :param cover_stego_paths_pair: Tuple containing paths to cover and stego images.
        """
        base_save_path = os.path.join(self.save_path, f"{watermark_model.modelname}")
        os.makedirs(base_save_path, exist_ok=True)
        lossy_save_path = os.path.join(base_save_path, "noise")
        os.makedirs(lossy_save_path, exist_ok=True)

        # Save noise parameters to a JSON file
        noise_params = []
        for noise_model in self.noise_models:
            noise_params.append({
                "noisename": noise_model.noisename,
                "factorsymbol": noise_model.factorsymbol,
                "factors": noise_model.factors,
                "printparams": noise_model.noisemodel.print_params()
            })
        with open(os.path.join(lossy_save_path, "noise_params.json"), 'w') as f:
            json.dump(noise_params, f, indent=4)

        # Apply noise models with tqdm progress bar
        for noise_model in self.noise_models:
            noise_type = noise_model.noisename
            for factor in noise_model.factors:
                save_dir = os.path.join(lossy_save_path, noise_type, str(factor))
                os.makedirs(save_dir, exist_ok=True)
                total_len = len(cover_stego_paths_pair[1])
                tar = tqdm(enumerate(cover_stego_paths_pair[1]),
                           desc=f"Model {watermark_model.modelname} Applying Noise Models", total=total_len)
                for img_index, stego_img_iter_paths in tar:
                    img_save_dir = os.path.join(save_dir, f"image_{img_index + 1}")
                    os.makedirs(img_save_dir, exist_ok=True)
                    for iter_index, stego_img_path in enumerate(stego_img_iter_paths):
                        iter_save_dir = os.path.join(img_save_dir, f"iter_{iter_index + 1}")
                        os.makedirs(iter_save_dir, exist_ok=True)
                        stego_img = np.float32(Image.open(stego_img_path))
                        cover_img = np.float32(Image.open(cover_stego_paths_pair[0][img_index][iter_index]))
                        noised_img = noise_model.noisemodel.test(stego_img, cover_img, factor)
                        Image.fromarray(noised_img.astype(np.uint8)).save(os.path.join(iter_save_dir, "noised.png"))
                        info = {
                            "noisemode": noise_model.noisemodel.print_params(),
                            "noisename": noise_type,
                            "factor": factor,
                            "image_index": img_index + 1,
                            "iteration_index": iter_index + 1
                        }
                        with open(os.path.join(iter_save_dir, "info.json"), 'w') as f:
                            json.dump(info, f, indent=4)

                        tar.set_description(
                            desc=f"Model {watermark_model.modelname} Applying Noise Model ({noise_type}), factor ({factor})")

    def _decode(self, watermark_model: BaseWatermarkModel, noise_img_path: str, batch_size: int):
        """
        Decodes the watermark from the noised images and saves the results. This method is responsible
        for extracting the secret bits from the noised stego images and evaluating the accuracy of the extraction.

        :param watermark_model: The watermarking model used.
        :param noise_img_path: Path to the directory containing noised images.
        """
        noised_img_paths = glob.glob(os.path.join(noise_img_path, '**', 'noised.png'), recursive=True)
        ddataloader = DecodeDataLoader(noised_img_paths, batch_size)
        decoding_results = []

        # Use tqdm to show progress during decoding
        tar = tqdm(ddataloader, desc=f"Model {watermark_model.modelname} Decoding", total=len(ddataloader))
        for noised_stego_list, noised_stego_path_list in tar:
            ext_bits_list = watermark_model.extract(noised_stego_list).ext_bits
            for ext_bits, noised_stego_path in zip(ext_bits_list, noised_stego_path_list):
                tar.set_description(desc=f"Model {watermark_model.modelname} Decoding - ({noised_stego_path})")
                secret4json, secret4bmp = self._reshape_secret(ext_bits)
                image_dir = os.path.dirname(noised_stego_path)
                ext_secret_bmp_path = os.path.join(image_dir, "ext_secret.bmp")
                Image.fromarray(secret4bmp.astype(np.uint8)).save(ext_secret_bmp_path)
                noise_info_path = os.path.join(image_dir, "info.json")
                if os.path.exists(noise_info_path):
                    with open(noise_info_path, 'r') as f:
                        noise_info = json.load(f)
                    noise_info["ext_secret"] = secret4json
                    with open(noise_info_path, 'w') as f:
                        json.dump(noise_info, f, indent=4)
                decoding_results.append({
                    "image_path": noised_stego_path,
                    "ext_secret": secret4json,
                    "noise_info": noise_info if os.path.exists(noise_info_path) else None
                })

        results_path = os.path.join(noise_img_path, "decoding_results.json")
        with open(results_path, 'w') as f:
            json.dump(decoding_results, f, indent=4)

    def _perform_experiment(self, watermark_model: BaseWatermarkModel, dataloader: DataLoader, mode: str = "default"):
        """
        Performs the entire watermarking experiment, including encoding, adding noise, and decoding.
        The specific steps executed depend on the value of the `mode` parameter.

        :param watermark_model: The watermarking model to use for the experiment.
        :param dataset: The dataset containing cover images and secret bits.
        :param mode: Determines which steps of the experiment to perform. Possible values:
                    - "default": Perform all steps (encode, add noise, decode).
                    - "encode": Perform only the encoding step and subsequent steps.
                    - "addnoise": Perform only the noise addition step and subsequent steps.
                    - "decode": Perform only the decoding step.
        """
        # Step 1: Perform encoding if mode is "default" or "encode"
        if mode in ["default", "encode"]:
            self._encode(watermark_model, dataloader)

        # Retrieve paths for stego and cover images
        img_pair_paths = self._get_img_paths(
            os.path.join(self.save_path, f"{watermark_model.modelname}/images"))

        # Step 2: Add noise if mode is "default" or "addnoise"
        if mode in ["default", "encode", "addnoise"]:
            self._addnoise(watermark_model, img_pair_paths)

        # Define the path for noise-affected images
        noise_img_path = os.path.join(self.save_path, f"{watermark_model.modelname}/noise")

        # Step 3: Perform decoding if mode is "default" or "decode"
        if mode in ["default", "encode", "addnoise", "decode"]:
            self._decode(watermark_model, noise_img_path, dataloader.batch_size)

    def test(self, watermark_model: BaseWatermarkModel, dataloader: DataLoader, mode: str = "default") -> dict:
        """
        Runs the entire watermarking experiment, including encoding, adding noise, decoding, and testing.
        The specific steps executed depend on the value of the `mode` parameter.

        :param watermark_model: The watermarking model to test.
        :param dataloader: The dataset containing cover images and secret bits.
        :param mode: Determines which steps of the experiment to perform. Possible values:
                    - "default": Perform all steps (encode, add noise, decode, and test).
                    - "encode": Perform only the encoding step and subsequent steps.
                    - "addnoise": Perform only the noise addition step and subsequent steps.
                    - "decode": Perform only the decoding step.
                    - "test": Perform only the testing steps (visual quality and robustness tests).
        :return: Dictionary containing combined results of visual quality and robustness tests.
        """
        # Perform the experiment steps if mode is not "test"
        if mode != "test":
            self._perform_experiment(watermark_model, dataloader, mode)

        # Retrieve paths for stego and cover images
        img_pair_paths = self._get_img_paths(
            os.path.join(self.save_path, f"{watermark_model.modelname}/images"))

        # Step 1: Test visual quality by comparing cover and stego images
        visual_quality_result = self._testvisualquality(img_pair_paths)

        # Define the path for noise-affected images and load noise parameters
        noise_img_path = os.path.join(self.save_path, f"{watermark_model.modelname}/noise")
        noise_params_path = os.path.join(noise_img_path, "noise_params.json")
        with open(noise_params_path, 'r') as f:
            noise_params = json.load(f)

        # Prepare noise information for robustness testing
        noise_info = []
        for noise_model_params in noise_params:
            noise_type = noise_model_params["noisename"]
            for factor in noise_model_params["factors"]:
                noise_info.append({
                    "noisename": noise_type,
                    "factor": factor,
                    "factorsymbol": noise_model_params["factorsymbol"],
                    "printparams": noise_model_params["printparams"]
                })

        # Step 2: Test robustness against different types of noise
        robustness_result = self._testrobustness(watermark_model, img_pair_paths, noise_info)

        # Combine results into a single dictionary
        combine_result = {
            "modelname": watermark_model.modelname,
            "imagesize": watermark_model.img_size,
            "bit_length": watermark_model.bits_len,
            "robustnessresult": robustness_result,
            "visualqualityresult": visual_quality_result
        }

        # Save the combined results to a JSON file
        save_dict_path = os.path.join(self.save_path, f"{watermark_model.modelname}")
        with open(os.path.join(save_dict_path, "combine_result.json"), 'w') as f:
            json.dump(combine_result, f, indent=4)

        # Return the combined results
        return combine_result

    def test_multiple(self, watermark_models: List[BaseWatermarkModel], dataloaders: List[DataLoader],
                      mode: str = "default") -> List[dict]:
        """
        Multi-threaded processing to run the `test` method for each combination of `watermark_model` and `dataset`.
        The results are returned in the same order as the input lists.

        :param watermark_models: A list of watermark models to test. The length must be at least 2.
        :param dataloaders: A list of datasets corresponding to the watermark models.
        :param mode: Determines which steps of the experiment to perform. Possible values:
                    - "default": Perform all steps (encode, add noise, decode, and test).
                    - "encode": Perform only the encoding step and subsequent steps.
                    - "addnoise": Perform only the noise addition step and subsequent steps.
                    - "decode": Perform only the decoding step.
                    - "test": Perform only the testing steps (visual quality and robustness tests).
        :return: A list of combined results, in the same order as the input lists.
        :raises ValueError: If the lengths of `watermark_models` and `datasets` do not match,
                           or if the length of `watermark_models` is less than 2.
        """
        # Step 1: Validate input parameters
        # Ensure that the length of `watermark_models` is at least 2.
        if len(watermark_models) < 2:
            raise ValueError("The length of `watermark_models` must be at least 2.")

        # Ensure that the lengths of `watermark_models` and `datasets` are the same.
        if len(watermark_models) != len(dataloaders):
            raise ValueError("The lengths of `watermark_models` and `datasets` must be the same.")

        # Step 2: Initialize a list to store results
        # Pre-fill the list with `None` to ensure results can be assigned to the correct index.
        combine_results = [None] * len(watermark_models)

        # Step 3: Define a thread function to run the `test` method for a single combination
        def run_test(index: int, watermark_model: BaseWatermarkModel, dataloader: DataLoader):
            """
            Internal function to run the `test` method for a single combination of
            `watermark_model` and `dataset`. The result is stored in the `combine_results`
            list at the specified index.

            :param index: The index of the current task, used to store the result in the correct position.
            :param watermark_model: The watermark model to test.
            :param dataloaders: The dataset to use for testing.
            """
            try:
                # Call the `test` method and store the result in the `combine_results` list.
                combine_results[index] = self.test(watermark_model, dataloader, mode)
            except Exception as e:
                # If an error occurs during the execution of `test`, log the error and store
                # an error message in the result list.
                print(f"Task {index} failed: {e}")
                combine_results[index] = {"error": str(e)}

        # Step 4: Create and start threads for each combination of `watermark_model` and `dataset`
        threads = []  # List to hold all threads
        for i, (watermark_model, dataloader) in enumerate(zip(watermark_models, dataloaders)):
            # Create a new thread for each combination
            thread = threading.Thread(target=run_test, args=(i, watermark_model, dataloader))

            # Add the thread to the list of threads
            threads.append(thread)

            # Start the thread
            thread.start()

        # Step 5: Wait for all threads to complete
        # Use the `join` method to ensure the main thread waits until all tasks are finished.
        for thread in threads:
            thread.join()

        # Step 6: Return the list of combined results
        return combine_results

    def _testrobustness(self, watermark_model: BaseWatermarkModel,
                        cover_stego_paths_pair: Tuple[List[List[str]], List[List[str]]], noise_info: List[dict]):
        """
        Tests the robustness of the watermarking model against various noise models by reading pre-extracted secrets.

        :param cover_stego_paths_pair: Tuple containing paths to cover and stego images.
        :param noise_info: List of dictionaries containing noise information.
        :return: Dictionary containing robustness test results.
        """
        robustness_result = {}

        # Use tqdm to show progress during robustness testing
        for info in tqdm(noise_info, desc="Testing Robustness"):
            noise_type = info.get('noisename', 'Unknown')
            factor = info.get('factor', 'Unknown')

            if noise_type not in robustness_result:
                robustness_result[noise_type] = {
                    "noisename": info.get("noisename", "Unknown"),
                    "factorsymbol": info.get("factorsymbol", "Unknown"),
                    "factors": {}
                }

            if str(factor) not in robustness_result[noise_type]["factors"]:
                robustness_result[noise_type]["factors"][str(factor)] = {}

            # Iterate over each image
            for img_index, (cover_paths, _) in enumerate(zip(cover_stego_paths_pair[0], cover_stego_paths_pair[1])):
                image_key = f"image_{img_index + 1}"
                robustness_result[noise_type]["factors"][str(factor)][image_key] = {
                    metric.__name__: [] for metric in self.robustnessmetrics
                }

                # Iterate over each experiment (iteration) for the current image
                for iter_index, cover_path in enumerate(cover_paths):
                    secret_path = os.path.join(os.path.dirname(cover_path), 'secret.json')
                    with open(secret_path, 'r') as f:
                        org_secret = json.load(f)

                    # Construct the path to the noisy image's info.json
                    noise_img_dir = os.path.join(
                        self.save_path, f"{watermark_model.modelname}/noise",
                        info["noisename"], str(info["factor"]), f"image_{img_index + 1}", f"iter_{iter_index + 1}"
                    )
                    info_json_path = os.path.join(noise_img_dir, "info.json")
                    if os.path.exists(info_json_path):
                        with open(info_json_path, 'r') as f:
                            noise_info_data = json.load(f)
                        ext_secret = noise_info_data.get("ext_secret", [])

                        # Calculate metrics for the current experiment
                        for metric in self.robustnessmetrics:
                            metric_name = metric.__name__
                            try:
                                metric_value = metric(org_secret, ext_secret)
                                robustness_result[noise_type]["factors"][str(factor)][image_key][metric_name].append(
                                    metric_value
                                )
                            except Exception as e:
                                print(
                                    f"Error calculating {metric_name} for image {image_key}, iteration {iter_index + 1}: {e}"
                                )
                    else:
                        print(
                            f"info.json ({info_json_path}) not found for image {image_key}, iteration {iter_index + 1}")

        return robustness_result

    def _testvisualquality(self, cover_stego_paths_pair: Tuple[List[List[str]], List[List[str]]]):
        """
        Tests the visual quality of the stego images compared to the cover images.

        :param cover_stego_paths_pair: Tuple containing paths to cover and stego images.
        :return: Dictionary containing visual quality test results.
        """
        visual_quality_result = {metric.__name__: [] for metric in self.vqmetrics}

        # Use tqdm to show progress during visual quality testing
        for cover_paths, stego_paths in tqdm(zip(cover_stego_paths_pair[0], cover_stego_paths_pair[1]),
                                             desc="Testing Visual Quality", total=len(cover_stego_paths_pair[0])):
            for cover_path, stego_path in zip(cover_paths, stego_paths):
                cover_img = np.float32(Image.open(cover_path))
                stego_img = np.float32(Image.open(stego_path))
                for metric in self.vqmetrics:
                    metric_name = metric.__name__
                    try:
                        metric_value = metric(cover_img, stego_img)
                        visual_quality_result[metric_name].append(metric_value)
                    except Exception as e:
                        print(f"Error calculating {metric_name} for cover: {cover_path} and stego: {stego_path}: {e}")

        return visual_quality_result

    def _get_img_paths(self, base_path: str) -> Tuple[list, list]:
        """
        Retrieves paths to all stego images.

        :param base_path: Base path to the stego images.
        :return: List of lists containing paths to stego images.
        """
        cover_img_paths = []
        stego_img_paths = []
        image_dirs = sorted(os.listdir(base_path))
        for img_dir in image_dirs:
            img_path = os.path.join(base_path, img_dir)
            iter_dirs = sorted(os.listdir(img_path))
            cover_img_paths.append([os.path.join(img_path, iter_dir, "cover.png") for iter_dir in iter_dirs])
            stego_img_paths.append([os.path.join(img_path, iter_dir, "stego.png") for iter_dir in iter_dirs])
        return cover_img_paths, stego_img_paths

    def _get_cover_img_paths(self, cover_base_path: str) -> list:
        """
        Retrieves paths to all cover images.

        :param cover_base_path: Base path to the cover images.
        :return: List of lists containing paths to cover images.
        """
        cover_img_paths = []
        image_dirs = sorted(os.listdir(cover_base_path))
        for img_dir in image_dirs:
            img_path = os.path.join(cover_base_path, img_dir)
            iter_dirs = sorted(os.listdir(img_path))
            cover_img_paths.append([os.path.join(img_path, iter_dir, "cover.png") for iter_dir in iter_dirs])
        return cover_img_paths

    def _normalize_secret(self, secret):
        """
        Normalizes the secret bits to a range of [0, 1].

        :param secret: The secret bits to normalize.
        :return: Normalized secret bits.
        """
        secret = np.array(secret, dtype=np.float32)
        if secret.size == 0:
            return secret.tolist()
        min_val = np.min(secret)
        max_val = np.max(secret)
        if min_val == max_val:
            secret.fill(0.5)
        else:
            secret = (secret - min_val) / (max_val - min_val)
        return secret.tolist()

    def _reshape_secret(self, secret):
        """
        Reshapes the secret bits into a 2D array for visualization.

        :param secret: The secret bits to reshape.
        :return: Tuple containing the reshaped secret bits and a visual representation.
        """
        if isinstance(secret, list):
            L = len(secret)
            secret = self._normalize_secret(secret)
            side = int(math.ceil(math.sqrt(L)))
            padded_list = np.pad(secret, (0, side * side - L), mode='constant', constant_values=2)
            array_2d = padded_list.reshape((side, side))
            watermark_visual = np.zeros((side, side, 3), dtype=np.uint8)
            watermark_visual[array_2d == 0] = [0, 0, 0]
            watermark_visual[array_2d == 1] = [255, 255, 255]
            watermark_visual[array_2d == 2] = [255, 0, 0]
            return secret, watermark_visual
        elif isinstance(secret, np.ndarray):
            if secret.ndim == 2:
                return secret.tolist(), secret
            elif secret.ndim == 3:
                if secret.shape[2] == 3:
                    return secret.tolist(), secret
                elif secret.shape[2] == 1:
                    return secret.tolist(), secret[:, :, 0]
                else:
                    raise ValueError("Unsupported ndarray shape: expected 2D or 3D array")
            else:
                raise ValueError("Unsupported ndarray shape: expected 2D or 3D array")
        else:
            raise TypeError("secret must be list or numpy.ndarray")
