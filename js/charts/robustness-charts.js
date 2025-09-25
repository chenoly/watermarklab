// js/charts/robustness-charts.js
// 鲁棒性图表渲染模块

// 在 robustness-charts.js 开头添加

// 预定义颜色数组（替代 Plotly.d3.scale.category10()）
const DEFAULT_COLORS = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

// 生成颜色的函数
function getColor(index) {
    if (index < DEFAULT_COLORS.length) {
        return DEFAULT_COLORS[index];
    } else {
        // 生成新颜色（简单的彩虹色算法）
        const hue = (index * 137.508) % 360; // 黄金角度
        return `hsl(${hue}, 70%, 50%)`;
    }
}

// 如果需要生成颜色比例尺的函数
function createColorScale() {
    return function(index) {
        return getColor(index);
    };
}

/**
 * 渲染鲁棒性排名 (区域 3 子部分 1)
 * @param {Array} modelsData - 模型数据数组
 */
function renderRobustnessRankings(modelsData) {
    // 计算R分数
    const RScores = DataProcessor.computeRScores(modelsData);

    // 计算平均R分数
    const avgRScores = {};
    for (const [noiseType, noiseData] of Object.entries(RScores)) {
        avgRScores[noiseType] = {};
        for (const [modelName, scores] of Object.entries(noiseData)) {
            if (scores.length > 0) {
                avgRScores[noiseType][modelName] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
            } else {
                avgRScores[noiseType][modelName] = 0;
            }
        }
    }

    // 渲染总体排名
    renderOverallRanking(avgRScores);

    // 渲染各失真下排名
    renderRankingsByDistortion(avgRScores);
}

/**
 * 渲染总体排名
 * @param {Object} avgRScores - 平均R分数 {noise_type: {model_name: avg_score}}
 */
function renderOverallRanking(avgRScores) {
    const container = document.getElementById('rankings-overall');
    if (!container) return;

    // 计算排名点数系统：每个噪声类型中，第一名得N分，第二名得N-1分...
    const modelPoints = {}; // {model_name: total_points}
    const modelParticipation = {}; // {model_name: count}

    const validNoiseTypes = Object.keys(avgRScores).filter(nt => nt !== 'No Attacking');

    validNoiseTypes.forEach(noiseType => {
        const noiseData = avgRScores[noiseType];

        // 获取有数据的模型
        const modelsWithData = Object.keys(noiseData).filter(
            modelName => noiseData[modelName] > 0
        );

        if (modelsWithData.length === 0) return;

        // 按平均分数排序（高分在前）
        const sortedModels = modelsWithData.sort(
            (a, b) => avgRScores[noiseType][b] - avgRScores[noiseType][a]
        );

        // 分配排名点数
        const numModels = sortedModels.length;
        sortedModels.forEach((modelName, rank) => {
            const points = numModels - rank; // 第一名得N分
            if (!modelPoints[modelName]) modelPoints[modelName] = 0;
            if (!modelParticipation[modelName]) modelParticipation[modelName] = 0;
            modelPoints[modelName] += points;
            modelParticipation[modelName] += 1;
        });
    });

    // 过滤掉没有参与的模型
    const modelsWithData = Object.keys(modelPoints).filter(
        modelName => modelParticipation[modelName] > 0
    );

    if (modelsWithData.length === 0) {
        container.innerHTML = '<p>No robustness data available for ranking.</p>';
        return;
    }

    // 按总点数排序（高分在前）
    const sortedModels = modelsWithData.sort(
        (a, b) => modelPoints[b] - modelPoints[a]
    );

    // 生成HTML
    let html = '<h4>Overall Robustness Ranking (Ranking Point System)</h4>';
    html += '<p>Scoring: 1st place = N points, 2nd = N-1 points, etc.</p>';
    html += '<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 20px;">';

    sortedModels.forEach((modelName, index) => {
        const rank = index + 1;
        const points = modelPoints[modelName];
        html += `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #1976d2;">#${rank}</div>
                <div style="font-weight: bold; margin: 5px 0;">${modelName}</div>
                <div>${points} points</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * 渲染各失真下排名
 * @param {Object} avgRScores - 平均R分数 {noise_type: {model_name: avg_score}}
 */
function renderRankingsByDistortion(avgRScores) {
    const container = document.getElementById('rankings-by-distortion');
    if (!container) return;

    container.innerHTML = '';

    // 遍历每个噪声类型
    for (const [noiseType, noiseData] of Object.entries(avgRScores)) {
        if (noiseType === 'No Attacking') continue;

        // 获取有数据的模型
        const modelsWithData = Object.keys(noiseData).filter(
            modelName => noiseData[modelName] > 0
        );

        if (modelsWithData.length === 0) continue;

        // 按平均分数排序（高分在前）
        const sortedModels = modelsWithData.sort(
            (a, b) => noiseData[b] - noiseData[a]
        );

        // 生成HTML
        const row = document.createElement('div');
        row.className = 'distortion-ranking-row';
        row.innerHTML = `<h4>${noiseType} Robustness Ranking</h4>`;

        const rankingContainer = document.createElement('div');
        rankingContainer.style.display = 'flex';
        rankingContainer.style.justifyContent = 'center';
        rankingContainer.style.flexWrap = 'wrap';
        rankingContainer.style.gap = '15px';

        sortedModels.forEach((modelName, index) => {
            const rank = index + 1;
            const score = (noiseData[modelName] || 0).toFixed(3);
            const card = document.createElement('div');
            card.style.backgroundColor = '#f5f5f5';
            card.style.padding = '10px';
            card.style.borderRadius = '5px';
            card.style.textAlign = 'center';
            card.style.minWidth = '100px';
            card.innerHTML = `
                <div style="font-size: 1.2rem; font-weight: bold; color: #333;">#${rank}</div>
                <div style="font-weight: bold; margin: 3px 0;">${modelName}</div>
                <div style="font-size: 0.9rem;">${score}</div>
            `;
            rankingContainer.appendChild(card);
        });

        row.appendChild(rankingContainer);
        container.appendChild(row);
    }
}

/**
 * 渲染模型鲁棒性折线图 (区域 3 子部分 2)
 * @param {Array} modelsData - 模型数据数组
 */
function renderRobustnessLineCharts(modelsData) {
    const container = document.getElementById('robustness-line-charts');
    if (!container) return;

    container.innerHTML = '';

    // 获取所有鲁棒性指标
    const allMetrics = new Set();
    modelsData.forEach(result => {
        if (result.testrobustnessmetrics) {
            result.testrobustnessmetrics.forEach(metric => allMetrics.add(metric));
        }
    });

    const metrics = Array.from(allMetrics);
    const allModelNames = modelsData.map(model => model.modelname);
    const modelColors = DataProcessor.getConsistentColors(allModelNames);

    // 为每个噪声类型和指标生成图表
    modelsData.forEach(result => {
        const modelName = result.modelname;
        if (!result.robustnessresult) return;

        for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
            if (noiseType === 'No Attacking') continue;

            // 计算有效因子数量
            const validFactorCount = Object.keys(noiseData.factors || {}).filter(
                factorStr => factorStr !== 'visualquality'
            ).length;

            // 只处理多因子噪声类型
            if (validFactorCount <= 1) continue;

            metrics.forEach(metric => {
                // 提取数据
                const factors = [];
                const factorLabels = [];
                const metricValues = [];

                if (noiseData.factors) {
                    // 收集因子和标签
                    const factorEntries = Object.entries(noiseData.factors).filter(
                        ([factorStr]) => factorStr !== 'visualquality'
                    );

                    // 转换因子值为数字并排序
                    const factorValues = factorEntries.map(([factorStr]) => {
                        if (factorStr === 'None' || factorStr === null) return 0;
                        const num = parseFloat(factorStr);
                        return isNaN(num) ? 0 : num;
                    });

                    // 获取排序索引
                    const sortedIndices = factorValues.map((_, i) => i)
                        .sort((a, b) => factorValues[a] - factorValues[b]);

                    // 按排序后的顺序收集数据
                    sortedIndices.forEach(i => {
                        const [factorStr, factorData] = factorEntries[i];
                        if (metric in factorData) {
                            factors.push(factorStr);
                            factorLabels.push(factorStr);

                            const metricData = factorData[metric];
                            if (Array.isArray(metricData) && metricData.length > 0) {
                                const avg = metricData.reduce((sum, val) => sum + parseFloat(val), 0) / metricData.length;
                                metricValues.push(avg);
                            } else if (typeof metricData === 'number' || (typeof metricData === 'string' && !isNaN(parseFloat(metricData)))) {
                                metricValues.push(parseFloat(metricData));
                            } else {
                                metricValues.push(0);
                            }
                        }
                    });
                }

                if (metricValues.length === 0) return;

                // 根据实际数据动态计算Y轴范围
                const validYValues = metricValues.filter(val => !isNaN(val) && isFinite(val));
                let yAxisRange;
                
                if (validYValues.length > 0) {
                    const minY = Math.min(...validYValues);
                    const maxY = Math.max(...validYValues);
                    
                    // 判断数据范围，决定Y轴配置
                    if (maxY <= 1.2 && minY >= -0.2) {
                        // 数据看起来是0-1范围（可能是TPR@N%FPR等比率指标）
                        yAxisRange = [0, 1];
                    } else if (maxY <= 105 && minY >= -5) {
                        // 数据看起来是0-100范围（可能是Extract Accuracy等百分比指标）
                        yAxisRange = [0, 100];
                    } else {
                        // 使用数据的实际范围，添加10%的边距
                        const margin = (maxY - minY) * 0.1;
                        yAxisRange = [Math.max(0, minY - margin), maxY + margin];
                    }
                } else {
                    yAxisRange = [0, 1]; // 默认范围
                }

                // 创建图表容器
                const chartWrapper = document.createElement('div');
                chartWrapper.className = 'chart-wrapper';

                const chartTitle = document.createElement('h4');
                chartTitle.textContent = `${modelName} - ${noiseType} - ${metric} Robustness`;
                chartTitle.style.textAlign = 'center';

                const chartContainer = document.createElement('div');
                chartContainer.className = 'chart-container';
                chartContainer.id = `robustness-${modelName}-${noiseType}-${metric}`.replace(/[^a-zA-Z0-9]/g, '_');

                chartWrapper.appendChild(chartTitle);
                chartWrapper.appendChild(chartContainer);
                container.appendChild(chartWrapper);

                // 渲染折线图
                const trace = {
                    x: factorLabels,
                    y: metricValues,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: modelName,
                    line: {
                        color: modelColors[modelName],
                        width: 2
                    },
                    marker: {
                        size: 6
                    }
                };

                const layout = {
                    title: `${modelName} - ${noiseType} - ${metric} Robustness`,
                    xaxis: {
                        title: noiseData.factorsymbol || 'Factor'
                    },
                    yaxis: {
                        title: metric,
                        range: yAxisRange, // 使用动态计算的范围
                        autorange: false, // 使用我们计算的范围
                        zeroline: true,  // 显示零线
                        zerolinecolor: '#d0d0d0'
                    },
                    margin: {
                        l: 50,
                        r: 20,
                        b: 50,
                        t: 50,
                        pad: 4
                    }
                };

                const config = {
                    responsive: true,
                    displayModeBar: true
                };

                Plotly.newPlot(chartContainer, [trace], layout, config);
            });
        }
    });
}

/**
 * 渲染PSNR vs Accuracy/TPR图表 (区域 3 子部分 3)
 * @param {Array} modelsData - 模型数据数组
 */
function renderPsnrVsAccuracyCharts(modelsData) {
    const container = document.getElementById('psnr-vs-accuracy-charts');
    if (!container) return;

    container.innerHTML = '';

    // 获取所有视觉质量和鲁棒性指标
    const visualQualityMetrics = new Set();
    const robustnessMetrics = new Set();

    modelsData.forEach(result => {
        if (result.testvisualqualitymetrics) {
            result.testvisualqualitymetrics.forEach(metric => {
                if (metric !== 'SSIM' && metric !== 'ssim') { // 移除SSIM
                    visualQualityMetrics.add(metric);
                }
            });
        }
        if (result.testrobustnessmetrics) {
            result.testrobustnessmetrics.forEach(metric => robustnessMetrics.add(metric));
        }
    });

    const vqMetrics = Array.from(visualQualityMetrics);
    const robustMetrics = Array.from(robustnessMetrics);
    const allModelNames = modelsData.map(model => model.modelname);
    const modelColors = DataProcessor.getConsistentColors(allModelNames);

    // 为每个模型生成图表
    modelsData.forEach(result => {
        const modelName = result.modelname;
        if (!result.robustnessresult) return;

        // 获取所有噪声类型（排除"No Attacking"）
        const noiseTypes = Object.keys(result.robustnessresult).filter(
            nt => nt !== 'No Attacking'
        );

        if (noiseTypes.length === 0) return;

        vqMetrics.forEach(vqMetric => {
            robustMetrics.forEach(robustMetric => {
                // 创建图表容器
                const chartWrapper = document.createElement('div');
                chartWrapper.className = 'chart-wrapper';

                const chartTitle = document.createElement('h4');
                chartTitle.textContent = `${modelName} - ${vqMetric} vs ${robustMetric} Performance`;
                chartTitle.style.textAlign = 'center';

                const chartContainer = document.createElement('div');
                chartContainer.className = 'chart-container';
                chartContainer.id = `performance-${modelName}-${vqMetric}-${robustMetric}`.replace(/[^a-zA-Z0-9]/g, '_');

                chartWrapper.appendChild(chartTitle);
                chartWrapper.appendChild(chartContainer);
                container.appendChild(chartWrapper);

                // 准备数据
                const traces = [];

                noiseTypes.forEach((noiseType, index) => {
                    const noiseData = result.robustnessresult[noiseType];
                    if (!noiseData.factors) return;

                    const xValues = []; // PSNR values
                    const yValues = []; // Robustness values
                    const factorLabels = [];

                    // 提取数据点
                    for (const [factorStr, factorData] of Object.entries(noiseData.factors)) {
                        if (factorStr === 'visualquality') continue;

                        if (!(robustMetric in factorData)) continue;
                        if (!factorData.visualquality || !(vqMetric in factorData.visualquality)) continue;

                        const robustData = factorData[robustMetric];
                        const vqData = factorData.visualquality[vqMetric];

                        // 获取平均值
                        let robustValue, vqValue;
                        if (Array.isArray(robustData)) {
                            robustValue = robustData.reduce((sum, val) => sum + parseFloat(val), 0) / robustData.length;
                        } else {
                            robustValue = parseFloat(robustData);
                        }

                        if (Array.isArray(vqData)) {
                            vqValue = vqData.reduce((sum, val) => sum + parseFloat(val), 0) / vqData.length;
                        } else {
                            vqValue = parseFloat(vqData);
                        }

                        // 检查值是否有效
                        if (!isNaN(robustValue) && isFinite(robustValue) &&
                            !isNaN(vqValue) && isFinite(vqValue)) {
                            xValues.push(vqValue);
                            yValues.push(robustValue);
                            factorLabels.push(factorStr);
                        }
                    }

                    if (xValues.length === 0) return;

                    // 按x值排序
                    const sortedIndices = xValues.map((_, i) => i)
                        .sort((a, b) => xValues[a] - xValues[b]);

                    const sortedX = sortedIndices.map(i => xValues[i]);
                    const sortedY = sortedIndices.map(i => yValues[i]);
                    const sortedLabels = sortedIndices.map(i => factorLabels[i]);
                    const getColor = (index) => {
                        if (index < DEFAULT_COLORS.length) {
                            return DEFAULT_COLORS[index];
                        } else {
                            const hue = (index * 137.508) % 360;
                            return `hsl(${hue}, 70%, 50%)`;
                        }
                    };
                    traces.push({
                        x: sortedX,
                        y: sortedY,
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: noiseType,
                        line: {
                            color: getColor(index),
                            width: 2
                        },
                        marker: {
                            size: 6
                        },
                        text: sortedLabels, // 悬停时显示因子标签
                        hoverinfo: 'x+y+text'
                    });
                });

                if (traces.length === 0) {
                    chartContainer.innerHTML = '<p style="text-align: center; color: #666;">No data available</p>';
                    return;
                }

                // 根据实际数据动态计算Y轴范围
                let allYValues = [];
                traces.forEach(trace => {
                    allYValues = allYValues.concat(trace.y.filter(val => !isNaN(val) && isFinite(val)));
                });
                
                let yAxisRange;
                if (allYValues.length > 0) {
                    const minY = Math.min(...allYValues);
                    const maxY = Math.max(...allYValues);
                    
                    // 判断数据范围，决定Y轴配置
                    if (maxY <= 1.2 && minY >= -0.2) {
                        // 数据看起来是0-1范围（可能是TPR@N%FPR等比率指标）
                        yAxisRange = [0, 1];
                    } else if (maxY <= 105 && minY >= -5) {
                        // 数据看起来是0-100范围（可能是Extract Accuracy等百分比指标）
                        yAxisRange = [0, 100];
                    } else {
                        // 使用数据的实际范围，添加10%的边距
                        const margin = (maxY - minY) * 0.1;
                        yAxisRange = [Math.max(0, minY - margin), maxY + margin];
                    }
                } else {
                    yAxisRange = [0, 1]; // 默认范围
                }

                const layout = {
                    title: `${modelName} - ${vqMetric} vs ${robustMetric} Performance`,
                    xaxis: {
                        title: vqMetric,
                        autorange: true // 启用自动范围
                    },
                    yaxis: {
                        title: robustMetric,
                        range: yAxisRange, // 使用动态计算的范围
                        autorange: false, // 使用我们计算的范围
                        zeroline: true,  // 显示零线
                        zerolinecolor: '#d0d0d0'
                    },
                    margin: {
                        l: 50,
                        r: 20,
                        b: 50,
                        t: 50,
                        pad: 4
                    }
                };

                const config = {
                    responsive: true,
                    displayModeBar: true
                };

                Plotly.newPlot(chartContainer, traces, layout, config);
            });
        });
    });
}

// 暴露函数到全局作用域
window.renderRobustnessRankings = renderRobustnessRankings;
window.renderRobustnessLineCharts = renderRobustnessLineCharts;
window.renderPsnrVsAccuracyCharts = renderPsnrVsAccuracyCharts;