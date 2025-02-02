import os
import random
import numpy as np
from tqdm import tqdm
from typing import List, Dict
import matplotlib.pyplot as plt

__all__ = ['plot_robustness', 'table_robustness', 'boxplot_visualquality', 'table_visualquality', 'radar_performance']


# -------------------- Robustness Visualization Functions --------------------

def plot_robustness(combined_results: List[Dict], save_path: str, metric="ber", figsize=(7, 3), style='default',
                    legend='auto'):
    """
    Plot robustness results using line plots for each watermarking method and distortion type.
    Each line represents a watermarking method, and the x-axis represents distortion factors.
    The y-axis represents the BER (Bit Error Rate) or extract accuracy.
    Shaded regions show the distribution of results across images and experiments.
    Each distortion type generates a separate PDF file.

    :param metric: Metric to plot. Must be one of ['ber', 'extract_accuracy'].
    :param combined_results: List of dictionaries containing robustness results for each model.
    :param save_path: Path to save the generated plots.
    :param figsize: Size of the figure (width, height).
    :param style: Matplotlib style to use (e.g., 'default', 'ggplot').
    :param legend: Legend placement option. Options include:
                   - 'auto': Automatically place the legend.
                   - 'best': Place the legend in the best location.
                   - 'upper right', 'upper left', 'lower right', 'lower left': Place the legend in a specific corner.
                   - 'outside': Place the legend outside the plot to the right.
                   - None: Do not display the legend.
    """
    # Validate the metric
    assert metric in ['ber', 'extract_accuracy'], "Metric must be one of ['ber', 'extract_accuracy']."

    # Ensure the save directory exists
    os.makedirs(save_path, exist_ok=True)

    # Set the matplotlib style
    plt.style.use(style)

    # Define a list of markers to assign to each model
    markers = ['o', 's', 'D', '^', 'v', 'p', '*', 'x', '+', '<', '>', 'd']

    # Assign a random marker to each model
    model_markers = {}
    for result in combined_results:
        modelname = result["modelname"]
        if modelname not in model_markers:
            model_markers[modelname] = random.choice(markers)  # Assign a random marker

    # Group results by distortion type
    distortion_types = set()
    for result in combined_results:
        distortion_types.update(result["robustnessresult"].keys())

    # Initialize tqdm progress bar
    tar = tqdm(distortion_types, desc="Starting...")

    for noise_type in tar:
        # Update progress bar description
        tar.set_description(f"Processing {noise_type}")

        plt.figure(figsize=figsize)

        # Set y-axis limits based on the metric
        # if metric == "ber":
        #     plt.ylim(-0.1, 1.1)  # Set y-axis range to [0, 1] for BER
        # else:
        #     plt.ylim(-10, 110)  # Set y-axis range to [0, 100] for extract accuracy

        for result in combined_results:
            modelname = result["modelname"]
            robustnessresult = result["robustnessresult"]

            # Update progress bar description to show current model
            tar.set_description(f"Processing {noise_type} - Model: {modelname}")

            if noise_type in robustnessresult:
                factors = robustnessresult[noise_type]["factors"]  # Access the factors dictionary
                x = []  # Distortion factors
                y_mean = []  # Mean metric values for each factor
                y_std = []  # Standard deviation of metric values for each factor

                # Iterate over factors and ensure they exist in the factors dictionary
                for factor in sorted(factors.keys(), key=lambda x: float(x)):
                    factor_float = float(factor)  # Convert factor to float for sorting and plotting
                    if factor not in factors:
                        print(f"Warning: Factor {factor} not found in factors for {noise_type}. Skipping.")
                        continue

                    # Collect metric values across all images and experiments
                    metric_values = []
                    for img_data in factors[factor].values():
                        metric_values.extend(img_data[metric])  # Extract metric values
                    if metric_values:  # Only add to x and y_mean if there are values
                        x.append(factor_float)
                        y_mean.append(np.mean(metric_values))
                        y_std.append(np.std(metric_values))

                # Plot the line with shaded region
                if x and y_mean:  # Ensure x and y_mean are not empty
                    marker = model_markers[modelname]  # Use the assigned marker for this model
                    plt.plot(x, y_mean, label=f"{modelname}", marker=marker, markersize=8, linewidth=2)

                    # Clip the bounds for the shaded region
                    if metric == "ber":
                        y_upper = np.minimum(np.add(y_mean, y_std), 1)  # Clip upper bound to 1
                        y_lower = np.maximum(np.subtract(y_mean, y_std), 0)  # Clip lower bound to 0
                    else:  # extract_accuracy
                        y_upper = np.minimum(np.add(y_mean, y_std), 100)  # Clip upper bound to 100
                        y_lower = np.maximum(np.subtract(y_mean, y_std), 0)  # Clip lower bound to 0

                    plt.fill_between(x, y_lower, y_upper, alpha=0.2)

        # Customize plot based on noise type
        plt.title(f"{noise_type}", fontsize=14)
        plt.xlabel(f"{robustnessresult[noise_type]['factorsymbol']}", fontsize=12)  # Use factorsymbol for x-axis label
        if metric == "ber":
            plt.ylabel("Bit Error Rate", fontsize=12)
        else:
            plt.ylabel("Extract Accuracy (%)", fontsize=12)

        # Handle legend placement
        if legend == 'auto':
            plt.legend(loc='best', fontsize=10)  # Automatically place the legend
        elif legend == 'outside':
            plt.legend(loc='upper left', bbox_to_anchor=(1.05, 1), fontsize=10,
                       borderaxespad=0.)  # Place legend outside
            plt.tight_layout(rect=[0, 0, 0.85, 1])  # Adjust layout to make space for the legend
        elif legend in ['best', 'upper right', 'upper left', 'lower right', 'lower left']:
            plt.legend(loc=legend, fontsize=10)  # Place legend in a specific corner
        elif legend is None:
            pass  # Do not display the legend
        else:
            raise ValueError(
                f"Invalid legend option: {legend}. Valid options are 'auto', 'best', 'upper right', 'upper left', 'lower right', 'lower left', 'outside', or None.")

        plt.grid(True, linestyle='--', alpha=0.6)  # Add grid lines
        plt.tight_layout()

        # Save plot as PDF without white borders
        save_file = os.path.join(save_path, f"robustness_{noise_type}_{metric}.pdf")
        plt.savefig(save_file, bbox_inches="tight", pad_inches=0)
        plt.close()


def table_robustness(combined_results: List[Dict], save_path: str, metric: str = "extract_accuracy",
                     distortions_per_table: int = 3,
                     max_rows_per_table: int = 10):
    """
    Generate LaTeX tables summarizing robustness results, with a specified number of distortion types per table.
    Each table will be resized to fit \linewidth.

    :param metric:
    :param combined_results: List of dictionaries containing robustness results for each model.
    :param save_path: Path to save the generated LaTeX tables.
    :param distortions_per_table: Number of distortion types to display per table.
    :param max_rows_per_table: Maximum number of rows per table (excluding header).
    """
    # Ensure the save directory exists
    os.makedirs(save_path, exist_ok=True)

    # Collect all distortion types and factors from combined_results
    distortion_types = set()
    factors_map = {}  # Maps distortion type to its factors
    factors_symbol_map = {}  # Maps distortion type to its factor symbol
    for result in combined_results:
        robustnessresult = result["robustnessresult"]
        for distortion, data in robustnessresult.items():
            distortion_types.add(distortion)
            if distortion not in factors_map:
                factors_map[distortion] = set(data["factors"].keys())
                factors_symbol_map[distortion] = data["factorsymbol"]  # Store factor symbol
            else:
                factors_map[distortion].update(data["factors"].keys())

    # Sort distortion types and factors for consistent order
    distortion_types = sorted(distortion_types)
    for distortion in distortion_types:
        factors_map[distortion] = sorted(factors_map[distortion], key=lambda x: float(x))

    # If no distortion types, return early
    if not distortion_types:
        print("No distortion types found. Skipping table generation.")
        return

    # Split distortion types into chunks of `distortions_per_table`
    # If distortion types are fewer than `distortions_per_table`, use the actual number
    distortions_per_table = min(distortions_per_table, len(distortion_types))
    distortion_chunks = [
        distortion_types[i:i + distortions_per_table]
        for i in range(0, len(distortion_types), distortions_per_table)
    ]

    # Split combined_results into chunks based on max_rows_per_table
    result_chunks = [
        combined_results[i:i + max_rows_per_table]
        for i in range(0, len(combined_results), max_rows_per_table)
    ]

    if metric == "ber":
        title_mode = "Bit Error Rate"
    else:
        title_mode = "Extract Accuracy"

    # Generate a table for each distortion chunk and result chunk
    for dist_chunk_idx, dist_chunk in enumerate(distortion_chunks):
        for result_chunk_idx, chunk_results in enumerate(result_chunks):
            # Generate the table header
            table = r"""
\begin{{table*}}[]
\centering
\caption{{""" + f"{title_mode}" + """ of various methods under various digital distortions (Part {}).}}
\label{{tab:distortion_acc_{}_{}}}
\resizebox{{\linewidth}}{{!}}{{%
\begin{{tabular}}{{>{{\centering\arraybackslash}}m{{1.5cm}}""".format(
                dist_chunk_idx + 1, dist_chunk_idx + 1, result_chunk_idx + 1)

            # Add columns for each distortion type and its factors
            for distortion in dist_chunk:
                num_factors = len(factors_map[distortion])
                table += "|"  # Add | between distortion types
                table += f">{{\\centering\\arraybackslash}}m{{0.5cm}}" * num_factors
            table += "}\n\\hline\n\\hline\n"

            # Add distortion type headers (first row)
            table += "\\multirow{2}{*}{Methods} "
            for i, distortion in enumerate(dist_chunk):
                num_factors = len(factors_map[distortion])
                if i == len(dist_chunk) - 1:
                    # Last distortion type: no right border
                    table += f"& \\multicolumn{{{num_factors}}}{{c}}{{{distortion} ({factors_symbol_map[distortion]})}} "
                else:
                    table += f"& \\multicolumn{{{num_factors}}}{{c|}}{{{distortion} ({factors_symbol_map[distortion]})}} "
            table += r"\\ \n"

            # Add factor headers (second row)
            table += "& "
            for i, distortion in enumerate(dist_chunk):
                factors = factors_map[distortion]
                table += " & ".join(factors)
                if i != len(dist_chunk) - 1:
                    table += " & "
            table += r" \\ \hline\n"

            # Add data for each model in the current chunk
            for result in chunk_results:
                modelname = result["modelname"]
                robustnessresult = result["robustnessresult"]

                # Extract accuracy for each distortion type and factor
                row_data = []
                for distortion in dist_chunk:
                    if distortion in robustnessresult:
                        factors = robustnessresult[distortion]["factors"]
                        for factor in factors_map[distortion]:
                            if factor in factors:
                                # Collect all extract accuracy values across images and experiments
                                accuracies = []
                                for image_data in factors[factor].values():
                                    accuracies.extend(image_data[metric])
                                # Calculate the average extract accuracy
                                avg_accuracy = np.mean(accuracies)  # Convert to percentage
                                row_data.append(f"{avg_accuracy:.2f}")
                            else:
                                row_data.append("N/A")  # If factor is missing
                    else:
                        row_data.extend(["N/A"] * len(factors_map[distortion]))  # If distortion is missing

                # Add row to the table
                table += f" {modelname} & {' & '.join(row_data)} \\\\ \\hline\n"

            # Close the table
            table += r"""\hline
\end{tabular}
}  % <-- Close the resizebox here
\end{table*}
"""

            # Save the table to a LaTeX file
            save_file = os.path.join(save_path,
                                     f"robustness_table_part_{dist_chunk_idx + 1}_{result_chunk_idx + 1}.tex")
            with open(save_file, "w") as f:
                f.write(table)

            print(f"\033[31mTable part {dist_chunk_idx + 1}_{result_chunk_idx + 1} saved to {save_file}\033[0m")


# -------------------- Visual Quality Visualization Functions --------------------


def boxplot_visualquality(visualqualityresults: List[Dict], save_path: str, figsize=(8, 6), style='default',
                          legend='auto'):
    """
    Plot visual quality results using boxplots.
    If PSNR and SSIM are available, generate separate boxplots for each metric.

    :param visualqualityresults: List of dictionaries containing visual quality results for each model.
    :param save_path: Path to save the generated plots.
    :param figsize: Size of the figure (width, height).
    :param style: Matplotlib style to use (e.g., 'default', 'ggplot').
    :param legend: Legend placement option. Options include:
                   - 'auto': Automatically place the legend.
                   - 'best': Place the legend in the best location.
                   - 'upper right', 'upper left', 'lower right', 'lower left': Place the legend in a specific corner.
                   - 'outside': Place the legend outside the plot to the right.
                   - None: Do not display the legend.
    """
    # Ensure the save directory exists
    os.makedirs(save_path, exist_ok=True)

    # Set the matplotlib style
    plt.style.use(style)

    # Define colors and markers for each model
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22',
              '#17becf']
    markers = ['o', 's', 'D', '^', 'v', 'p', '*', 'x', '+', '<', '>', 'd']

    # Extract available metrics (PSNR, SSIM, etc.)
    metrics = set()
    for result in visualqualityresults:
        metrics.update(result["visualqualityresult"].keys())

    # Generate a boxplot for each metric
    for metric in metrics:
        # Prepare data for boxplot
        model_names = [result["modelname"] for result in visualqualityresults]
        quality_metrics = [result["visualqualityresult"].get(metric, []) for result in visualqualityresults]

        # Create the boxplot
        plt.figure(figsize=figsize)
        box = plt.boxplot(quality_metrics, patch_artist=True, labels=model_names, showfliers=True)

        # Set colors for the boxes with transparency
        for patch, color in zip(box['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.5)  # Add transparency

        # Calculate mean values for each model
        mean_values = [np.mean(data) if data else None for data in quality_metrics]

        # Plot the mean values as a connected line with markers
        x_positions = np.arange(1, len(model_names) + 1)  # X positions for the models
        plt.plot(x_positions, mean_values, marker='o', linestyle='--', color='black',
                 markersize=8, linewidth=2, label="Mean Values")

        # Customize the plot
        plt.ylabel(metric.upper(), fontsize=12)

        # Add grid
        plt.grid(True, linestyle='--', alpha=0.6)

        # Handle legend placement
        if legend == 'auto':
            plt.legend(loc='best', fontsize=10)  # Automatically place the legend
        elif legend == 'outside':
            plt.legend(loc='upper left', bbox_to_anchor=(1.05, 1), fontsize=10,
                       borderaxespad=0.)  # Place legend outside
            plt.tight_layout(rect=[0, 0, 0.85, 1])  # Adjust layout to make space for the legend
        elif legend in ['best', 'upper right', 'upper left', 'lower right', 'lower left']:
            plt.legend(loc=legend, fontsize=10)  # Place legend in a specific corner
        elif legend is None:
            pass  # Do not display the legend
        else:
            raise ValueError(
                f"Invalid legend option: {legend}. Valid options are 'auto', 'best', 'upper right', 'upper left', 'lower right', 'lower left', 'outside', or None.")

        # Save the plot
        save_file = os.path.join(save_path, f"visual_quality_{metric}_boxplot.pdf")
        plt.savefig(save_file, bbox_inches="tight", pad_inches=0)
        plt.close()


def table_visualquality(combined_results: List[Dict], save_path: str):
    """
    Generate a LaTeX table summarizing visual quality results (e.g., PSNR and SSIM).
    The table includes the mean and standard deviation for each model and metric.

    :param combined_results: List of dictionaries containing visual quality results for each model.
    :param save_path: Path to save the generated LaTeX table.
    """
    # Ensure the save directory exists
    os.makedirs(save_path, exist_ok=True)

    # Extract available metrics (PSNR, SSIM, etc.)
    metrics = set()
    for result in combined_results:
        metrics.update(result["visualqualityresult"].keys())

    # Calculate column width based on the number of columns
    num_columns = len(metrics) + 1  # +1 for the Model column
    column_width = f"{0.8 / num_columns:.2f}\\linewidth"  # 90% of \linewidth divided by the number of columns

    # Prepare the table header
    table = r"""
\begin{table}[]
\centering
\caption{Visual Quality Results (Mean ± Standard Deviation)}
\label{tab:visual_quality_results}
\begin{tabular}{"""
    # Add column formatting
    table += f">{{\\centering\\arraybackslash}}m{{{column_width}}}|"  # First column for Model
    for i, _ in enumerate(metrics):
        if i == len(metrics) - 1:  # Last column should not have a vertical line
            table += f">{{\\centering\\arraybackslash}}m{{{column_width}}}"  # No | at the end
        else:
            table += f">{{\\centering\\arraybackslash}}m{{{column_width}}}|"  # Columns for metrics
    table += r"} \hline\hline" + "\n"

    # Add metric names to the header
    table += "Model & " + " & ".join([metric.upper() for metric in metrics]) + r" \\ \hline" + "\n"

    # Add data for each model
    for result in combined_results:
        modelname = result["modelname"]
        visualqualityresult = result["visualqualityresult"]

        # Prepare the row data
        row_data = [modelname]
        for metric in metrics:
            if metric in visualqualityresult:
                data = visualqualityresult[metric]
                mean = np.mean(data)
                std = np.std(data)
                row_data.append(f"{mean:.2f} ± {std:.2f}")  # Format as mean ± std
            else:
                row_data.append("N/A")  # If metric is missing, use "N/A"

        # Add the row to the table
        table += " & ".join(row_data) + r" \\ \hline" + "\n"

    # Close the table
    table += r"""\hline
\end{tabular}
\end{table}
"""

    # Save the table to a LaTeX file
    save_file = os.path.join(save_path, "visual_quality_table.tex")
    with open(save_file, "w") as f:
        f.write(table)

    print(f"\033[31mTable saved to {save_file}\033[0m")


# -------------------- Performance Visualization Functions --------------------

def radar_performance(combined_results: List[Dict], save_path: str, figsize=(6, 4), style='default', legend='best'):
    """
    Plot overall performance (mean ber, mean psnr, bit_length) using radar charts.
    Each radar chart represents a watermarking method, and the axes represent:
    - Robustness (Mean BER): Lower is better, normalized to a score (higher is better).
    - Imperceptibility (Mean PSNR): Higher is better, normalized to a score.
    - Capacity (Bit Length): Higher is better, normalized to a score.

    :param combined_results: List of dictionaries containing performance metrics for each model.
    :param save_path: Path to save the generated radar charts.
    :param figsize: Size of the figure (width, height).
    :param style: Matplotlib style to use (e.g., 'default', 'ggplot').
    :param legend: Legend placement option. Options include:
                   - 'auto': Automatically place the legend.
                   - 'best': Place the legend in the best location.
                   - 'upper right', 'upper left', 'lower right', 'lower left': Place the legend in a specific corner.
                   - None: Do not display the legend.
    """
    # Ensure the save directory exists
    os.makedirs(save_path, exist_ok=True)

    # Set the matplotlib style
    plt.style.use(style)

    # Labels for the radar chart axes
    labels = ['Robustness', 'Imperceptibility', 'Capacity']
    num_vars = len(labels)

    # Prepare angles for the radar chart
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    angles += angles[:1]  # Close the plot

    # Initialize the radar chart
    fig, ax = plt.subplots(figsize=figsize, subplot_kw=dict(polar=True))

    # Draw one axis per variable and add labels
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_rlabel_position(0)
    plt.xticks(angles[:-1], labels, fontsize=12, color='black')

    def normalize_to_score(value, min_val, max_val, reverse=False):
        """Normalize a value to a score between 2 and 10."""
        if max_val == min_val:
            return 10  # Return a fixed score if all values are the same
        if reverse:
            return 1 + 9 * (max_val - value) / (max_val - min_val)  # Map to [2, 10]
        else:
            return 1 + 9 * (value - min_val) / (max_val - min_val)  # Map to [2, 10]

    # Collect all metrics for normalization
    all_ber = []
    all_psnr = []
    all_capacity = []
    for result in combined_results:
        robustnessresult = result["robustnessresult"]
        visualqualityresult = result["visualqualityresult"]

        # Calculate mean BER across all distortions and factors
        ber_values = []
        for distortion in robustnessresult.keys():
            for factor in robustnessresult[distortion]["factors"].values():
                for img_data in factor.values():
                    ber_values.extend(img_data["ber"])
        all_ber.append(np.mean(ber_values))

        # Calculate mean PSNR
        all_psnr.append(np.mean(visualqualityresult["psnr"]))

        # Get bit length
        all_capacity.append(result["bit_length"] / result["imagesize"])

    # Define min and max values for normalization
    min_ber, max_ber = min(all_ber), max(all_ber)
    min_psnr, max_psnr = min(all_psnr), max(all_psnr)
    min_capacity, max_capacity = min(all_capacity), max(all_capacity)

    # Define a color palette for models
    colors = plt.cm.viridis(np.linspace(0, 1, len(combined_results)))

    # Plot each model's performance
    for idx, result in enumerate(combined_results):
        imagesize = result["imagesize"]
        modelname = result["modelname"]
        robustnessresult = result["robustnessresult"]
        visualqualityresult = result["visualqualityresult"]

        # Calculate mean BER across all distortions and factors
        ber_values = []
        for distortion in robustnessresult.keys():
            for factor in robustnessresult[distortion]["factors"].values():
                for img_data in factor.values():
                    ber_values.extend(img_data["ber"])
        mean_ber = np.mean(ber_values)

        # Calculate mean PSNR
        mean_psnr = np.mean(visualqualityresult["psnr"])

        # Get bit length
        capacity = result["bit_length"] / imagesize

        # Normalize metrics to scores (2 to 10)
        ber_score = normalize_to_score(mean_ber, min_ber, max_ber, True)  # Lower BER is better
        psnr_score = normalize_to_score(mean_psnr, min_psnr, max_psnr)  # Higher PSNR is better
        bit_length_score = normalize_to_score(capacity, min_capacity, max_capacity)  # Higher bit length is better

        # Combine scores for the radar chart
        values = [ber_score, psnr_score, bit_length_score]
        values += values[:1]  # Close the plot

        # Plot the radar chart for this model
        ax.plot(angles, values, linewidth=2, linestyle='solid', label=modelname, color=colors[idx])
        ax.fill(angles, values, color=colors[idx], alpha=0.2)  # Transparent fill

    # Handle legend placement
    if legend == 'auto':
        plt.legend(loc='best', fontsize=10, bbox_to_anchor=(1.1, 1.05))  # Automatically place the legend
    elif legend == 'outside':
        plt.legend(loc='upper left', bbox_to_anchor=(1.05, 1), fontsize=10, borderaxespad=0.)  # Place legend outside
        plt.tight_layout(rect=[0, 0, 0.85, 1])  # Adjust layout to make space for the legend
    elif legend in ['best', 'upper right', 'upper left', 'lower right', 'lower left']:
        plt.legend(loc=legend, fontsize=10)  # Place legend in a specific corner
    elif legend is None:
        pass  # Do not display the legend
    else:
        raise ValueError(
            f"Invalid legend option: {legend}. Valid options are 'auto', 'best', 'upper right', 'upper left', 'lower right', 'lower left', 'outside', or None.")

    # Add grid and customize appearance
    ax.grid(True, linestyle='--', alpha=0.6, color='gray')
    ax.set_facecolor('#f7f7f7')  # Light gray background
    ax.spines['polar'].set_color('gray')  # Axis color

    # Save plot as PDF without white borders
    save_file = os.path.join(save_path, "radar_performance.pdf")
    plt.savefig(save_file, bbox_inches="tight", pad_inches=0, dpi=300)
    plt.close()

    print(f"\033[31mSaved radar chart: {save_file}\033[0m")
