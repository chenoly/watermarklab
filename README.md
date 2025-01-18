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
import glob
import torch
import random
import os.path
import argparse
import numpy as np
from PIL import Image
from numpy import ndarray
import watermarklab as wl
from typing import List, Any
from DRRW.nets.nets import Model
from torchvision import transforms
from FIN.nets.encoder_decoder import FED
from DRRW.compressor.rdh import CustomRDH
from watermarklab.laboratories import WLab
from watermarklab.utils.data import DataLoader
from watermarklab.noiselayers.testdistortions import *
from DRRW.compressor.utils_compressors import TensorCoder
from watermarklab.utils.basemodel import BaseWatermarkModel, Result, BaseDataset, NoiseModelWithFactors


class FIN(BaseWatermarkModel):
    def __init__(self, model_save_path: str, bits_len: int, img_size: int, modelname: str):
        super().__init__(bits_len, img_size, modelname)
        self.device = "cpu"
        torch.set_default_dtype(torch.float64)
        self.model = FED(self.device, diff=False, length=bits_len)
        self.model.load_state_dict(torch.load(model_save_path, map_location=self.device))
        self.model.eval()

    def embed(self, cover_list: List[Any], secrets: List[List]) -> Result:
        _cover_tensor = torch.as_tensor(np.stack(cover_list)).permute(0, 3, 1, 2)
        _secrets_tensor = torch.as_tensor(np.stack(secrets))
        with torch.no_grad():
            secret_tensor = _secrets_tensor.to(self.device) - 0.5
            cover_tensor = _cover_tensor.to(self.device) / 255.
            normalize = transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
            cover_tensor = normalize(cover_tensor)
            secret_tensor = secret_tensor.to(torch.float64)
            cover_tensor = cover_tensor.to(torch.float64)
            out = self.model((cover_tensor, secret_tensor))
            stego = torch.round(torch.clamp((out[0] + 1.) / 2. * 255, 0, 255))
        stego_list = []
        for i in range(stego.shape[0]):
            stego_ndarray = stego[i].permute(1, 2, 0).cpu().detach().numpy()
            stego_list.append(stego_ndarray)
        res = Result(stego_img=stego_list)
        return res

    def extract(self, stego_list: List[Any]) -> Result:
        _stego_tensor = torch.as_tensor(np.stack(stego_list)).permute(0, 3, 1, 2)
        with torch.no_grad():
            guass_noise = torch.zeros((1, self.bits_len)).to(self.device)
            stego_tensor = _stego_tensor.to(self.device) / 255.
            normalize = transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
            stego_tensor = normalize(stego_tensor)
            stego_tensor = stego_tensor.to(torch.float64)
            guass_noise = guass_noise.to(torch.float64)
            out = self.model((stego_tensor, guass_noise), rev=True)
            secrets = torch.round(torch.clamp(out[1] + 0.5, 0, 1))
        secret_list = []
        for i in range(secrets.shape[0]):
            secret = secrets[i].cpu().detach().numpy().tolist()
            secret_list.append(secret)
        res = Result(ext_bits=secret_list)
        return res

    def recover(self, stego_list: List[ndarray]) -> Result:
        pass


class DRRW(BaseWatermarkModel):
    def __init__(self, img_size, channel_dim, bit_length, min_size, k, fc, model_save_path: str, level_bits_len,
                 freq_bits_len, modelname: str, height_end=5, compress_mode="a"):
        super().__init__(bit_length, img_size, modelname)
        self.device = "cpu"
        self.bit_length = bit_length
        torch.set_default_dtype(torch.float64)
        self.model = Model(img_size, channel_dim, bit_length, k, min_size, fc)
        self.model.load_model(model_save_path)
        self.model.eval()
        self.compress_mode = compress_mode
        self.rdh = CustomRDH((img_size, img_size, channel_dim), height_end)
        self.tensorcoder = TensorCoder((img_size, img_size, channel_dim), (1, bit_length), level_bits_len,
                                       freq_bits_len)

    def embed(self, cover_list: List[Any], secrets: List[List]) -> Result:
        _cover_tensor = torch.as_tensor(np.stack(cover_list)).permute(0, 3, 1, 2) / 255.
        _secrets_tensor = torch.as_tensor(secrets) / 1.
        with torch.no_grad():
            secret_tensor = _secrets_tensor.to(self.device)
            cover_tensor = _cover_tensor.to(self.device)
            cover_tensor = cover_tensor.to(torch.float64)
            secret_tensor = secret_tensor.to(torch.float64)
            stego, drop_z = self.model(cover_tensor, secret_tensor, True, False)
            stego_255 = torch.round(torch.clip(stego * 255., 0, 255.))
        stego_list = []
        for i in range(stego_255.shape[0]):
            stego = stego_255[i].permute(1, 2, 0).cpu().detach().numpy()
            stego_list.append(stego)
        res = Result(stego_img=stego_list)
        return res

    def extract(self, stego_list: List[ndarray]) -> Result:
        _stego_tensor = torch.as_tensor(np.stack(stego_list)).permute(0, 3, 1, 2)
        with torch.no_grad():
            stego_tensor = _stego_tensor.to(self.device) / 255.
            z_tensor = torch.randn(size=(1, self.bit_length))
            stego_tensor = stego_tensor.to(torch.float64)
            z_tensor = z_tensor.to(torch.float64)
            _, ext_secrets = self.model(stego_tensor, z_tensor, True, True)
            ext_secrets = np.round(np.clip(ext_secrets.squeeze(0).detach().cpu().numpy(), 0, 1)).astype(int)
        secret_list = []
        for i in range(ext_secrets.shape[0]):
            secret = ext_secrets[i].cpu().detach().numpy().tolist()
            secret_list.append(secret)
        res = Result(ext_bits=secret_list)
        return res

    def recover(self, stego_list: List[ndarray]) -> Result:
        pass


class RDRRW(BaseWatermarkModel):
    def __init__(self, img_size, channel_dim, bit_length, min_size, k, fc, model_save_path: str, level_bits_len,
                 freq_bits_len, modelname: str, height_end=5, compress_mode="a"):
        super().__init__(bit_length, img_size, modelname)
        self.device = "cpu"
        self.bit_length = bit_length
        torch.set_default_dtype(torch.float64)
        self.model = Model(img_size, channel_dim, bit_length, k, min_size, fc)
        self.model.load_model(model_save_path)
        self.model.eval()
        self.compress_mode = compress_mode
        self.rdh = CustomRDH((img_size, img_size, channel_dim), height_end)
        self.tensorcoder = TensorCoder((img_size, img_size, channel_dim), (1, bit_length), level_bits_len,
                                       freq_bits_len)

    def embed(self, cover_list: List[Any], secrets: List[List]) -> Result:
        _cover_tensor = torch.as_tensor(np.stack(cover_list)).permute(0, 3, 1, 2) / 255.
        _secrets_tensor = torch.as_tensor(secrets) / 1.
        with torch.no_grad():
            secret_tensor = _secrets_tensor.to(self.device)
            cover_tensor = _cover_tensor.to(self.device)
            cover_tensor = cover_tensor.to(torch.float64)
            secret_tensor = secret_tensor.to(torch.float64)
            stego, drop_z = self.model(cover_tensor, secret_tensor, True, False)
            stego_255 = torch.round(stego * 255.)
            drop_z_round = torch.round(drop_z)
        stego_list = []
        for i in range(stego_255.shape[0]):
            clip_stego, aux_bits_tuple = self.tensorcoder.compress(stego_255[i].unsqueeze(0),
                                                                   drop_z_round[i].unsqueeze(0),
                                                                   mode=self.compress_mode)
            data_list, drop_z_bits, overflow_bits = aux_bits_tuple
            _, rw_stego_img = self.rdh.embed(clip_stego, data_list)
            stego_list.append(rw_stego_img)
        res = Result(stego_img=stego_list)
        return res

    def extract(self, stego_list: List[ndarray]) -> Result:
        _stego_tensor = torch.as_tensor(np.stack(stego_list)).permute(0, 3, 1, 2) / 255.
        with torch.no_grad():
            stego_tensor = _stego_tensor.to(self.device)
            z_tensor = torch.randn(size=(1, self.bit_length))
            stego_tensor = stego_tensor.to(torch.float64)
            z_tensor = z_tensor.to(torch.float64)
            _, ext_secrets = self.model(stego_tensor, z_tensor, True, True)
            ext_secrets = np.round(np.clip(ext_secrets.squeeze(0).detach().cpu().numpy(), 0, 1)).astype(int)
        secret_list = []
        for i in range(ext_secrets.shape[0]):
            secret = ext_secrets[i].cpu().detach().numpy().tolist()
            secret_list.append(secret)
        res = Result(ext_bits=secret_list)
        return res

    def recover(self, stego_list: List[ndarray]) -> Result:
        pass


class Mydataloader(BaseDataset):
    def __init__(self, root_path: str, bit_length, iter_num: int):
        super().__init__(iter_num)
        self.root_path = root_path
        self.bit_length = bit_length
        self.covers = []
        self.load_paths()

    def load_paths(self):
        self.covers = glob.glob(os.path.join(self.root_path, '*.png'), recursive=True)

    def load_cover_secret(self, index: int):
        cover = np.float32(Image.open(self.covers[index]))
        random.seed(index)
        secret = [random.randint(0, 1) for _ in range(self.bit_length)]
        return cover, secret

    def get_num_covers(self):
        return len(self.covers)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--img_size', type=int, default=256)
    parser.add_argument('--channel_dim', type=int, default=3)
    parser.add_argument('--bit_length', type=int, default=64)
    parser.add_argument('--min_size', type=int, default=16)
    parser.add_argument('--k', type=int, default=5)
    parser.add_argument('--level_bits_len', type=int, default=10)
    parser.add_argument('--freq_bits_len', type=int, default=25)
    parser.add_argument('--fc', type=bool, default=False)
    parser.add_argument('--model_save_path', type=str, default=r"DRRW/saved_models/color_566.pth")
    parser.add_argument('--seed', type=int, default=99)
    parser.add_argument('--dataset_path', type=str, default=r"basedataset/realflow_compare")
    parser.add_argument('--save_stego_path', type=str, default=r"DRRW/result/stego/realflow_compare")
    args = parser.parse_args()
    drrw = DRRW(args.img_size, args.channel_dim, args.bit_length, args.min_size, args.k,
                args.fc, args.model_save_path, args.level_bits_len, args.freq_bits_len, "DRRW", compress_mode="a")

    parser = argparse.ArgumentParser()
    parser.add_argument('--img_size', type=int, default=256)
    parser.add_argument('--channel_dim', type=int, default=3)
    parser.add_argument('--bit_length', type=int, default=64)
    parser.add_argument('--min_size', type=int, default=16)
    parser.add_argument('--k', type=int, default=5)
    parser.add_argument('--level_bits_len', type=int, default=10)
    parser.add_argument('--freq_bits_len', type=int, default=25)
    parser.add_argument('--fc', type=bool, default=False)
    parser.add_argument('--model_save_path', type=str, default=r"DRRW/saved_models/color_566.pth")
    parser.add_argument('--seed', type=int, default=99)
    parser.add_argument('--dataset_path', type=str, default=r"basedataset/realflow_compare")
    parser.add_argument('--save_stego_path', type=str, default=r"DRRW/result/stego/realflow_compare")
    args = parser.parse_args()
    rdrrw = RDRRW(args.img_size, args.channel_dim, args.bit_length, args.min_size, args.k,
                  args.fc, args.model_save_path, args.level_bits_len, args.freq_bits_len, "DRRW-R", compress_mode="a")

    fin = FIN("FIN/saved_models/fin_new.pth", 64, 256, "FIN")
    testnoisemodels = [
        NoiseModelWithFactors(noisemodel=Jpeg(), noisename="Jpeg Compression", factors=[10, 30, 50, 70, 90],
                              factorsymbol="$Q_f$"),
        NoiseModelWithFactors(noisemodel=SaltPepperNoise(), noisename="Salt&Pepper Noise",
                              factors=[0.1, 0.3, 0.5, 0.7, 0.9], factorsymbol="$p$"),
        NoiseModelWithFactors(noisemodel=GaussianNoise(), noisename="Gaussian Noise",
                              factors=[0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45], factorsymbol="$\sigma$"),
        NoiseModelWithFactors(noisemodel=GaussianBlur(), noisename="Gaussian Blur",
                              factors=[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4], factorsymbol="$\sigma$"),
        NoiseModelWithFactors(noisemodel=MedianFilter(), noisename="Median Filter", factors=[3, 5, 7, 9, 11, 13, 15],
                              factorsymbol="$w$"),
        NoiseModelWithFactors(noisemodel=Dropout(), noisename="Dropout", factors=[0.1, 0.3, 0.5, 0.7, 0.9],
                              factorsymbol="$p$"),
    ]

    mydataset = Mydataloader(root_path="basedataset/realflow_compare/", bit_length=64, iter_num=5)
    dataloader = DataLoader(mydataset, batch_size=20)

    wlab = WLab("save_new/realflow_compare", noise_models=testnoisemodels)

    rdrrw_result = wlab.test(rdrrw, dataloader=dataloader)
    drrw_result = wlab.test(drrw, dataloader=dataloader)
    fin_result = wlab.test(fin, dataloader=dataloader)

    result_list = [fin_result, drrw_result, rdrrw_result]

    wl.plot_robustness(result_list, "save_new/realflow_compare", metric="extract_accuracy")
    wl.table_robustness(result_list, "save_new/realflow_compare")
    wl.boxplot_visualquality(result_list, "save_new/realflow_compare")
    wl.table_visualquality(result_list, "save_new/realflow_compare")
    wl.radar_performance(result_list, "save_new/realflow_compare")
```

## Performance Evaluation
WatermarkLab provides various performance evaluation tools, including:
- SSIM: Evaluates the visual quality of watermarked images.
- PSNR: Measures the distortion of watermarked images.
- BER: Evaluates the bit error rate of extracted watermarks.
- Extraction Accuracy: Measures the accuracy of extracted watermarks.
Here’s an example performance evaluation chart ![Plot](figures/plot.png)![Plot](figures/radar.png):
```bash
    result_list = wlab.test(model, dataloader)

    wl.plot_robustness(result_list, "save/draw_result", metric="extract_accuracy")
    wl.table_robustness(result_list, "save/draw_result")
    wl.boxplot_visualquality(result_list, "save/draw_result")
    wl.table_visualquality(result_list, "save/draw_result")
    wl.radar_performance(result_list, "save/draw_result")
```
## License

WatermarkLab is licensed under the MIT License. See the license file for details.
