import numpy as np
from PIL import Image
from numpy import ndarray
from typing import List, Tuple
from watermarklab.utils.basemodel import BaseDataset

__all__ = ["DataLoader"]


class DataLoader:
    def __init__(self, dataset: BaseDataset, batch_size: int = 1):
        """
        DataLoader class for loading batches of data from a dataset.

        Args:
            dataset (BaseDataset): The dataset to load data from.
            batch_size (int): Number of samples per batch. Default is 1.
        """
        self.dataset = dataset
        self.batch_size = batch_size
        self.indices = list(range(len(dataset)))  # List of all indices

    def __iter__(self):
        """
        Initialize the iterator.

        Returns:
            self: The DataLoader instance.
        """
        self.current_index = 0
        return self

    def __next__(self) -> Tuple[List[ndarray], List[List], List[int], List[int]]:
        """
        Load the next batch of data.

        Returns:
            Tuple[List[np.ndarray], List[List], List[int], List[int]]: A tuple containing:
                - List of cover images (List[np.ndarray])
                - List of secrets (List[List])
                - List of cover indices (List[int])
                - List of experiment indices (List[int])
        """
        # Check if we have reached the end of the dataset
        if self.current_index >= len(self.indices):
            raise StopIteration  # End of iteration

        # Get the indices for the current batch
        batch_indices = self.indices[self.current_index:self.current_index + self.batch_size]
        self.current_index += self.batch_size

        # Load the data for the current batch
        batch = [self.dataset[idx] for idx in batch_indices]

        # Unpack the batch into separate lists
        covers, secrets, cover_indices, iter_indices = zip(*batch)

        # Convert tuples to lists
        covers = list(covers)
        secrets = list(secrets)
        cover_indices = list(cover_indices)
        iter_indices = list(iter_indices)

        return covers, secrets, cover_indices, iter_indices

    def __len__(self) -> int:
        """
        Get the total number of batches.

        Returns:
            int: The total number of batches.
        """
        return (len(self.dataset) + self.batch_size - 1) // self.batch_size


class DecodeDataLoader:
    """
    A custom DataLoader class that loads images from a list of paths and iterates over them in batches.
    """
    def __init__(self, image_paths, batch_size=1):
        """
        Initialize the CustomDataLoader.

        :param image_paths: List of paths to the images.
        :param batch_size: Number of images per batch, default is 1.
        """
        self.image_paths = image_paths
        self.batch_size = batch_size
        self.num_images = len(image_paths)
        self.current_index = 0

    def __iter__(self):
        """
        Make the object iterable.
        """
        self.current_index = 0  # Reset the index for each iteration
        return self

    def __next__(self):
        """
        Get the next batch of images.

        :return: A batch of images as a numpy ndarray.
        :raises StopIteration: When all images have been iterated over.
        """
        if self.current_index >= self.num_images:
            raise StopIteration  # Stop iteration when all images are processed

        # Get the batch of image paths
        batch_paths = self.image_paths[self.current_index:self.current_index + self.batch_size]
        self.current_index += self.batch_size

        # Load images and convert them to ndarrays
        batch_images = []
        path_list = []
        for path in batch_paths:
            image = Image.open(path)
            image_array = np.float32(image)  # Convert to ndarray
            batch_images.append(image_array)
            path_list.append(path)
        return batch_images, path_list

    def __len__(self):
        """
        Get the total number of batches.

        :return: Total number of batches.
        """
        return (self.num_images + self.batch_size - 1) // self.batch_size