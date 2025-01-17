<h1 align="center">WatermarkLab</h1>

<p align="center">
  <img src="./figures/logo.svg" alt="WatermarkLab Logo" width="150">
</p>

**WatermarkLab** is a powerful toolkit for robust image watermarking research and development. It provides a complete suite of tools for watermark embedding, extraction, robustness testing, and performance evaluation, helping researchers and developers easily implement and evaluate robust image watermarking algorithms.

---

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Example Code](#example-code)
- [Performance Evaluation](#performance-evaluation)
- [License](#license)

---

## Introduction

**WatermarkLab** is a Python library designed for digital watermarking research. It supports the following core functionalities:
- **Watermark Embedding**: Embed watermark information into images.
- **Watermark Extraction**: Extract embedded watermark information from images.
- **Robustness Testing**: Test watermark robustness by simulating various image processing operations (e.g., compression, noise, filtering).
- **Performance Evaluation**: Provide multiple evaluation metrics (e.g., SSIM, PSNR, BER) to measure the performance of watermarking algorithms.

---

## Features

- **Modular Design**: Supports custom watermarking algorithms and noise models.
- **Multiple Distortions**: Simulates distortions such as JPEG compression, Gaussian blur, salt-and-pepper noise, and more.
- **Performance Metrics**: Provides evaluation metrics like SSIM, PSNR, and BER.
- **Visualization Tools**: Generates charts for robustness testing and performance evaluation.

---

## Installation

Install **WatermarkLab** via pip:

```bash
pip install watermarklab
```

## Quick start
Here’s a simple example to demonstrate how to use WatermarkLab for watermark embedding and extraction:
```bash
import watermarklab as wl
from watermarklab.basemodel import BaseWatermarkModel, BaseLoader
from watermarklab.noiselayers.testdistortions import Jpeg, GaussianBlur

# Custom watermark model
class MyWatermarkModel(BaseWatermarkModel):
    def embed(self, cover_img, watermark):
        # Watermark embedding logic
        stego_img = cover_img  # Example: return the original image
        return wl.Result(stego_img=stego_img)

    def extract(self, stego_img):
        # Watermark extraction logic
        extracted_watermark = [0, 1, 0, 1]  # Example: return a fixed watermark
        return wl.Result(ext_bits=extracted_watermark)

class Mydataloader(BaseLoader):
    def __init__(self, root_path: str, bit_length, iter_num: int):
        super().__init__(iter_num)
        self.root_path = root_path
        self.bit_length = bit_length
        self.covers = []
        self.load_paths()

    def load_paths(self):
        self.covers = glob.glob(os.path.join(self.root_path, '*.png'), recursive=True)
        # self.covers = [i for i in range(10)]

    def load_cover_secret(self, index: int):
        cover = np.float32(Image.open(self.covers[index]))
        random.seed(index)
        secret = [random.randint(0, 1) for _ in range(self.bit_length)]
        return cover, secret

    def get_num_covers(self):
        return len(self.covers)


# Create a watermark lab
noise_models = [
    wl.NoiseModelWithFactors(noisemodel=Jpeg(), noisename="JPEG Compression", factors=[50, 70, 90]),
    wl.NoiseModelWithFactors(noisemodel=GaussianBlur(), noisename="Gaussian Blur", factors=[1.0, 2.0, 3.0]),
]
wlab = wl.WLab(save_path="results", noise_models=noise_models)

# Test the watermark model
model = MyWatermarkModel(bits_len=256, img_size=512, modelname="MyModel")
dataset = Mydataloader(..., iter_num=10)  # Example dataset
wlab.test(model, dataset)
```

## Example Code
Here’s a more advanced example demonstrating how to use WatermarkLab for robustness testing and performance evaluation:
```bash
import argparse
import watermarklab as wl
from watermarklab.basemodel import BaseWatermarkModel, BaseLoader
from watermarklab.noiselayers.testdistortions import Jpeg, GaussianBlur

# Custom watermark model
class RRW(BaseWatermarkModel):
    def __init__(self, root_path, bit_length, img_size, modelname):
        super().__init__(bit_length, img_size, modelname)
        self.root_path = root_path

    def embed(self, cover_img, watermark):
        # Watermark embedding logic
        stego_img = cover_img  # Example: return the original image
        return wl.Result(stego_img=stego_img)

    def extract(self, stego_img):
        # Watermark extraction logic
        extracted_watermark = [0, 1, 0, 1]  # Example: return a fixed watermark
        return wl.Result(ext_bits=extracted_watermark)

class Mydataloader(BaseLoader):
    def __init__(self, root_path: str, bit_length, iter_num: int):
        super().__init__(iter_num)
        self.root_path = root_path
        self.bit_length = bit_length
        self.covers = []
        self.load_paths()

    def load_paths(self):
        self.covers = glob.glob(os.path.join(self.root_path, '*.png'), recursive=True)
        # self.covers = [i for i in range(10)]

    def load_cover_secret(self, index: int):
        cover = np.float32(Image.open(self.covers[index]))
        random.seed(index)
        secret = [random.randint(0, 1) for _ in range(self.bit_length)]
        return cover, secret

    def get_num_covers(self):
        return len(self.covers)

# Main program
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--img_size', type=int, default=512)
    parser.add_argument('--bit_length', type=int, default=256)
    args = parser.parse_args()

    # Initialize model and data loader
    rrw = RRW(root_path="data", bit_length=args.bit_length, img_size=args.img_size, modelname="RRW")
    dataset = Mydataloader(..., iter_num=10)

    # Define noise models
    noise_models = [
        wl.NoiseModelWithFactors(noisemodel=Jpeg(), noisename="JPEG Compression", factors=[50, 70, 90]),
        wl.NoiseModelWithFactors(noisemodel=GaussianBlur(), noisename="Gaussian Blur", factors=[1.0, 2.0, 3.0]),
    ]

    # Create a watermark lab and run tests
    wlab = wl.WLab(save_path="results", noise_models=noise_models)
    wlab.test(rrw, dataset)
```
## Performance Evaluation
WatermarkLab provides various performance evaluation tools, including:
- SSIM: Evaluates the visual quality of watermarked images.
- PSNR: Measures the distortion of watermarked images.
- BER: Evaluates the bit error rate of extracted watermarks.
- Extraction Accuracy: Measures the accuracy of extracted watermarks.
Here’s an example performance evaluation chart ![Plot](figures/plot.png)![Plot](figures/radar.png):
```bash
    result_list = wlab.test(model_list, datasets)

    wl.plot_robustness(result_list, "save/draw_result", metric="extract_accuracy")
    wl.table_robustness(result_list, "save/draw_result")
    wl.boxplot_visualquality(result_list, "save/draw_result")
    wl.table_visualquality(result_list, "save/draw_result")
    wl.radar_performance(result_list, "save/draw_result")
```
## License

WatermarkLab is licensed under the MIT License. See the license file for details.
