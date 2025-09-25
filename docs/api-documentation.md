<!-- watermarklab-website/docs/api-documentation.md -->
# WatermarkLab API Documentation

## Version: 1.0.0

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Core Concepts](#core-concepts)
4. [Main Modules](#main-modules)
5. [API Reference](#api-reference)
   - [Laboratories](#laboratories)
   - [Watermark Models](#watermark-models)
   - [Attackers](#attackers)
   - [Metrics](#metrics)
   - [Data Loading](#data-loading)
6. [Usage Examples](#usage-examples)
7. [License](#license)

## Introduction
WatermarkLab is a comprehensive Python toolkit for the development, evaluation, and comparison of robust image watermarking techniques. It supports both Post-Generation Watermarking (PGW) and In-Generation Watermarking (IGW) approaches, providing a unified framework for benchmarking watermarking algorithms under various attack scenarios.

Key features:
- Unified evaluation pipeline for both PGW and IGW models
- Extensive collection of image attacks for robustness testing
- Comprehensive set of evaluation metrics
- Modular design for easy extension
- Structured result reporting with visualizations

## Installation

### Prerequisites
- Python 3.8+
- PyTorch
- NumPy
- OpenCV
- PIL
- diffusers (for IGW models)
- lpips (for perceptual similarity metrics)

### Installation Command
```bash
pip install watermarklab
```

## Core Concepts

### Watermark Model Types
- **PGW (Post-Generation Watermarking)**: Watermark is embedded into pre-existing images
- **IGW (In-Generation Watermarking)**: Watermark is embedded during the image generation process (e.g., in diffusion models)

### Evaluation Pipeline
The library provides a standardized evaluation process consisting of:
1. Embedding watermark into cover images/prompts
2. Applying various attacks (noise, compression, geometric transformations)
3. Extracting watermark from attacked images
4. Computing evaluation metrics
5. Generating comprehensive result reports

## Main Modules

### 1. Laboratories
The laboratories module provides the core evaluation framework that orchestrates the testing pipeline for both PGW and IGW models.

### 2. Watermarks
Contains implementations of various watermarking algorithms, categorized into PGWs and IGWs.

### 3. Attackers
Implements a wide range of image attacks to test watermark robustness.

### 4. Metrics
Provides evaluation metrics for measuring watermark imperceptibility and robustness.

### 5. Utils
Includes utility functions, base classes, and data handling components.

## API Reference

### Laboratories

#### evaluate
```python
def evaluate(save_path: str,
             watermark_model: BaseWatermarkModel,
             noise_models: List[AttackerWithFactors],
             dataloader: DataLoader,
             vqmetrics: List[BaseMetric] = None,
             robustnessmetrics: List[BaseMetric] = None,
             fid_dataset: str = "MS-COCO-2017-VAL",
             mode: str = "encode",
             fid_batchsize: int = 32,
             fid_device: str = "cuda",
             noise_save: bool = False,
             need_cover: bool = False) -> dict:
```

**Description**: Unified entry point for evaluating both Post-Generation (PGW) and In-Generation (IGW) watermarking models.

**Parameters**:
- `save_path`: Root directory to save all evaluation outputs
- `watermark_model`: Watermarking model to evaluate
- `noise_models`: List of noise attack configurations with intensity factors
- `dataloader`: Provides input data (images for PGW, prompts for IGW) and secret bits
- `vqmetrics`: Visual quality metrics (default: [PSNR(), SSIM()])
- `robustnessmetrics`: Robustness metrics (default: [TPR_AT_N_PERCENT_FPR(), EA()])
- `fid_dataset`: Name of real image dataset for FID comparison (IGW only)
- `mode`: Evaluation mode: "encode" (full pipeline) or "decode" (robustness-only)
- `fid_batchsize`: Batch size for FID computation
- `fid_device`: Device for FID computation ("cuda" or "cpu")
- `noise_save`: If True, preserves intermediate noised images
- `need_cover`: If True, uses clean images as reference for visual metrics in IGW

**Returns**: Comprehensive evaluation report as a dictionary.

#### WLab
```python
class WLab:
    def __init__(self,
                 save_path: str,
                 noise_models: List[AttackerWithFactors],
                 vqmetrics: List[BaseMetric] = None,
                 robustnessmetrics: List[BaseMetric] = None,
                 noise_save: bool = False):
```

**Description**: Unified orchestrator for evaluating both Post-Generation (PGW) and In-Generation (IGW) watermarking models.

**Main Methods**:
- `test(watermark_model, dataloader, mode="encode", fid_dataset="MS-COCO-2017-VAL", fid_batchsize=32, device="cuda", need_cover=False)`: Execute full evaluation pipeline for the specified watermarking model.

### Watermark Models

#### BaseWatermarkModel
```python
class BaseWatermarkModel(ABC, nn.Module):
    def __init__(self, bits_len: int, img_size: int, modelname: str, description: str = None):
```

**Description**: Abstract base class for all watermarking models (both PGW and IGW).

**Main Methods**:
- `embed(cover_list, secrets)`: Embeds a watermark into cover images or prompts.
- `extract(stego_list)`: Extracts watermark bits from stego images.
- `recover(stego_list)`: Recovers the original cover image from a stego image (reversible watermarking).

#### Implemented PGW Models
- `dctDwt`
- `rivaGAN`
- `dctDwtSvd`
- `TrustMark`
- `InvisMark`
- `StegaStamp`

#### Implemented IGW Models
- `TreeRing`
- `GaussianShading`
- `StableSignature`

### Attackers

#### BaseTestAttackModel
```python
class BaseTestAttackModel(ABC):
    def __init__(self, noisename: str, factor_inversely_related: bool = False):
```

**Description**: Abstract base class for image noise and distortion models used in watermark robustness evaluation.

**Main Methods**:
- `attack(stego_img, cover_img, factor)`: Applies noise/distortion to stego images.

#### Implemented Attack Models
- `Identity`
- `GaussianBlur`
- `GaussianNoise`
- `Jpeg`
- `SaltPepperNoise`
- `Jpeg2000`
- `MedianFilter`
- `MeanFilter`
- `PixelDropout`
- `Cropout`
- `Crop`
- `RegionZoom`
- `Resize`
- `Rotate`
- `UnsharpMasking`
- `ContrastReduction`
- `ContrastEnhancement`
- `ColorQuantization`
- `ChromaticAberration`
- `GammaCorrection`
- `WebPCompression`
- `PoissonNoise`
- `VAE-based attacks`
- `DiffuseAttack`
- `And many more...`

#### AttackerWithFactors
```python
class AttackerWithFactors:
    def __init__(self,
                 attacker: BaseTestAttackModel,
                 attackername: str,
                 factors: List[Any],
                 factorsymbol: str):
```

**Description**: Wrapper that combines a noise model with its test factors and display symbol.

### Metrics

#### Visual Quality Metrics
```python
def ssim(img1, img2, window_size=11, data_range=255):
    """Compute the Structural Similarity Index (SSIM) between two images."""


def psnr(img1, img2, data_range=255):
    """Calculate the Peak Signal-to-Noise Ratio (PSNR)."""


def lpips(img1, img2, device="cpu", net_stype="alex"):
    """Calculate the Learned Perceptual Image Patch Similarity (LPIPS)."""
```

#### Robustness Metrics
- `ber`: Bit Error Rate
- `ea`: Extraction Accuracy
- `normalized_correlation`: Normalized Correlation between extracted and original bits

### Data Loading

#### DataLoader
```python
class DataLoader:
    def __init__(self, dataset: BaseDataset, batch_size: int = 1):
```

**Description**: Generic data loader for watermarking experiments that batches samples from a BaseDataset.

**Main Methods**:
- `__iter__()`: Reset and return iterator for a new epoch.
- `__next__()`: Yield the next batch of data.
- `__len__()`: Compute total number of batches per epoch.

#### BaseDataset
```python
class BaseDataset(ABC):
    def __init__(self, img_size: int, bit_len: int, iter_num: int, dataset_name: str):
```

**Description**: Abstract base class for datasets used in watermarking evaluation.

**Main Methods**:
- `load_data(index)`: Loads a single cover/prompt and generates a secret bit sequence.
- `__getitem__(index)`: Returns a cover/prompt and secret for a specific experiment.
- `__len__()`: Total number of experiments (covers × iterations).
- `get_num_covers()`: Gets the number of unique covers/prompts in the dataset.

## Usage Examples

### Basic Evaluation Pipeline

```python
from watermarklab.laboratories import evaluate
from watermarklab.watermarks.PGWs import StegaStamp
from watermarklab.attackers.testattackers import GaussianNoise, Jpeg
from watermarklab.utils.basemodel import AttackerWithFactors
from watermarklab.utils.data import DataLoader
from watermarklab.datasets.datasets import TestDataset

# Initialize watermark model
model = StegaStamp(bits_len=16, img_size=256)

# Define attacks
noise_attacks = [
    AttackerWithFactors(
        attacker=GaussianNoise(),
        attackername="Gaussian Noise",
        factors=[5, 10, 15],
        factorsymbol="$\sigma$"
    ),
    AttackerWithFactors(
        attacker=Jpeg(),
        attackername="JPEG Compression",
        factors=[90, 70, 50],
        factorsymbol="$Q$"
    )
]

# Create dataset and dataloader
dataset = TestDataset(img_size=256, bit_len=16, iter_num=3, dataset_name="TestSet")
dataloader = DataLoader(dataset, batch_size=4)

# Run evaluation
results = evaluate(
    save_path="./results",
    watermark_model=model,
    noise_models=noise_attacks,
    dataloader=dataloader,
    mode="encode"
)

# Process results
print(f"Evaluation completed for {model.modelname}")
print(f"PSNR: {results['visualqualityresult']['PSNR']:.2f} dB")
print(f"SSIM: {results['visualqualityresult']['SSIM']:.4f}")
```

### Custom Watermark Model

```python
from watermarklab.utils.basemodel import BaseWatermarkModel, Result
import numpy as np

class MyCustomWatermark(BaseWatermarkModel):
    def __init__(self, bits_len=32, img_size=256):
        super().__init__(bits_len=bits_len, img_size=img_size, modelname="MyCustomWatermark")
        # Initialize your model parameters here
        
    def embed(self, cover_list, secrets):
        # Implement watermark embedding logic
        stego_images = []
        for cover, secret in zip(cover_list, secrets):
            # Your embedding code here
            stego = cover.copy()  # Example placeholder
            stego_images.append(stego)
        
        return Result(
            stego_img=stego_images,
            emb_bits=secrets
        )
        
    def extract(self, stego_list):
        # Implement watermark extraction logic
        extracted_bits = []
        for stego in stego_list:
            # Your extraction code here
            bits = [0] * self.bits_len  # Example placeholder
            extracted_bits.append(bits)
        
        return Result(
            ext_bits=extracted_bits
        )
        
    def recover(self, stego_list):
        # Implement cover recovery for reversible watermarking
        # For irreversible methods, you can return stego_list or raise NotImplementedError
        return Result(
            rec_img=stego_list
        )

# Use your custom model
custom_model = MyCustomWatermark(bits_len=16, img_size=256)
# Then use it in the evaluation pipeline as shown in the basic example
```

## License
WatermarkLab is released under the MIT License.

```
Copyright (c) 2025 Jiale Chen <chenoly@outlook.com>. All rights reserved.
SPDX-License-Identifier: MIT
```