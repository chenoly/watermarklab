import setuptools

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setuptools.setup(
    name="watermarklab",
    version="0.0.11",
    author="chenoly",
    author_email="chenoly@foxmail.com",
    description="A comprehensive toolkit for digital watermarking research and development.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/chenoly/watermarklab",
    packages=setuptools.find_packages(),
    install_requires=[
        "numpy>=1.21.0",
        "torch>=1.10.0",
        "scipy>=1.7.0",
        "matplotlib>=3.4.0",
        "kornia>=0.6.0",
        "tqdm>=4.62.0",
        "opencv-python>=4.5.0",
    ],
    python_requires=">=3.7",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "Intended Audience :: Developers",
        "Topic :: Scientific/Engineering :: Image Processing",
        "Topic :: Security :: Cryptography",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Operating System :: OS Independent",
    ],
    keywords=[
        "robust image watermarking",
        "robustness testing",
    ],
    project_urls={
        "Bug Reports": "https://github.com/chenoly/watermarklab/issues",
        "Source": "https://github.com/chenoly/watermarklab",
        "Documentation": "https://watermarklab.readthedocs.io",
    },
)