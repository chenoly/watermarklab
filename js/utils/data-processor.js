// js/utils/data-processor.js
// 数据处理工具模块

class DataProcessor {
    /**
     * 从结果数据中提取多值视觉质量指标
     * @param {Array} results - 模型结果数组
     * @returns {Object} 指标数据 {metric_name: {model_name: [values]}}
     */
    static extractMultiValueMetrics(results) {
        const metricsData = {};

        results.forEach(result => {
            const multiValueMetrics = result.testvisualqualitymetrics || [];
            const modelName = result.modelname || 'Unknown';
            
            console.log(`Processing model: ${modelName}, metrics:`, multiValueMetrics);

            if (!result.visualqualityresult) {
                console.warn(`No visualqualityresult found for model: ${modelName}`);
                return;
            }
            
            multiValueMetrics.forEach(metric => {
                console.log(`Processing metric: ${metric} for model: ${modelName}`);
                
                if (!metricsData[metric]) {
                    metricsData[metric] = {};
                }

                if (result.visualqualityresult[metric]) {
                    const metricData = result.visualqualityresult[metric];
                    console.log(`Found data for ${metric}:`, metricData);
                    
                    if (Array.isArray(metricData)) {
                        const validValues = metricData.filter(val => {
                            const num = parseFloat(val);
                            return !isNaN(num) && isFinite(num);
                        }).map(val => parseFloat(val));

                        if (validValues.length > 0) {
                            metricsData[metric][modelName] = validValues;
                            console.log(`Added ${validValues.length} values for ${metric} - ${modelName}`);
                        } else {
                            console.warn(`No valid values found for ${metric} - ${modelName}`);
                        }
                    } else {
                        console.warn(`Expected array for ${metric} but got:`, typeof metricData);
                    }
                } else {
                    console.warn(`No data found for metric ${metric} in model ${modelName}`);
                }
            });
        });
        
        console.log('Final extracted metrics:', Object.keys(metricsData));
        return metricsData;
    }

    /**
     * 从结果数据中提取FID数据
     * @param {Array} results - 模型结果数组
     * @returns {Object} FID数据 {model_name: {datasetname, stego_fid, clean_fid}}
     */
    static extractFidData(results) {
        const fidData = {};

        results.forEach(result => {
            const modelName = result.modelname || 'Unknown';
            const modelType = this.getModelType(result);

            if (!result.visualqualityresult) return;

            const vqResult = result.visualqualityresult;

            if (vqResult.FID) {
                const fidInfo = vqResult.FID;
                if (typeof fidInfo === 'object' && fidInfo.FID) {
                    const fidValues = fidInfo.FID;
                    const datasetName = fidInfo.datasetname || 'Unknown';

                    let stegoFid = null;
                    let cleanFid = null;

                    // 提取stego FID
                    if (fidValues.stego !== undefined && fidValues.stego !== null && fidValues.stego !== 'N/A') {
                        const val = parseFloat(fidValues.stego);
                        if (!isNaN(val) && isFinite(val)) {
                            stegoFid = val;
                        }
                    }

                    if (fidValues.clean !== undefined && fidValues.clean !== null && fidValues.clean !== 'N/A') {
                        const val = parseFloat(fidValues.clean);
                        if (!isNaN(val) && isFinite(val)) {
                            cleanFid = val;
                        }
                    }

                    if (stegoFid !== null) {
                        fidData[modelName] = {
                            datasetname: datasetName,
                            stego_fid: stegoFid,
                            clean_fid: cleanFid,
                            model_type: modelType
                        };
                    }
                }
            }
        });

        return fidData;
    }

    /**
     * 获取模型类型 (PGW 或 IGW)
     * @param {Object} modelData - 模型数据
     * @returns {string} 'PGW' 或 'IGW'
     */
    static getModelType(modelData) {
        const modelType = modelData.modeltype || '';
        if (modelType.includes('Post-Generation')) {
            return 'PGW';
        } else if (modelType.includes('In-Generation')) {
            return 'IGW';
        } else {
            return 'Unknown';
        }
    }

    /**
     * 为所有模型获取一致的颜色
     * @param {Array} modelNames - 模型名称数组
     * @returns {Object} 模型名称到颜色的映射
     */
    static getConsistentColors(modelNames) {
        // 去重并排序
        const uniqueModelNames = [...new Set(modelNames)].sort();

        // 更美观的现代化颜色方案（选择鲜艳且区分度高的颜色）
        const modernColors = [
            '#FF6B6B', // 珊瑚红
            '#4ECDC4', // 青蓝色
            '#45B7D1', // 天空蓝
            '#96CEB4', // 薄荷绿
            '#FECA57', // 金黄色
            '#FF9FF3', // 樱花粉
            '#54A0FF', // 明亮蓝
            '#5F27CD', // 深紫色
            '#00D2D3', // 青绿色
            '#FF9F43', // 橙色
            '#EE5A24', // 热情红
            '#0ABDE3', // 清新蓝
            '#10AC84', // 翠绿色
            '#F79F1F', // 金橙色
            '#A3CB38', // 春绿色
            '#C44569', // 玫瑰红
            '#778BEB', // 薰衣草紫
            '#F8B500', // 明黄色
            '#B8860B', // 暗金色
            '#32CD32'  // 酸橙绿
        ];

        const modelColors = {};
        uniqueModelNames.forEach((name, index) => {
            // 使用现代化颜色，如果超出范围则生成新颜色
            if (index < modernColors.length) {
                modelColors[name] = modernColors[index];
            } else {
                // 生成新颜色（使用HSL颜色空间，高饱和度和亮度）
                const hue = (index * 137.508) % 360; // 黄金角度
                modelColors[name] = `hsl(${hue}, 75%, 60%)`; // 提高饱和度和亮度
            }
        });

        return modelColors;
    }
    /**
     * 提取鲁棒性数据用于特定指标
     * @param {Array} results - 模型结果数组
     * @param {string} metric - 鲁棒性指标名称
     * @returns {Object} 提取的数据
     */
    static extractRobustnessData(results, metric) {
        const extractedData = {};

        results.forEach(result => {
            const modelName = result.modelname || 'Unknown';
            const modelType = this.getModelType(result);

            if (!result.robustnessresult) return;

            for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
                if (!(noiseType in extractedData)) {
                    extractedData[noiseType] = {
                        factors: {},
                        factor_inversely_related: noiseData.factor_inversely_related || false,
                        factorsymbol: noiseData.factorsymbol || 'Factor',
                        noisename: noiseData.noisename || noiseType
                    };
                }

                // 提取因子数据
                if (noiseData.factors) {
                    for (const [factorStr, factorData] of Object.entries(noiseData.factors)) {
                        if (!(factorStr in extractedData[noiseType].factors)) {
                            extractedData[noiseType].factors[factorStr] = {};
                        }

                        if (metric in factorData) {
                            const metricData = factorData[metric];

                            // 处理列表和单值指标
                            if (Array.isArray(metricData) && metricData.length > 0) {
                                const avgValue = metricData.reduce((sum, val) => sum + parseFloat(val), 0) / metricData.length;
                                const stdValue = metricData.length > 1 ?
                                    Math.sqrt(metricData.reduce((sum, val) => sum + Math.pow(parseFloat(val) - avgValue, 2), 0) / (metricData.length - 1)) : 0;

                                extractedData[noiseType].factors[factorStr][modelName] = {
                                    value: avgValue,
                                    std: stdValue,
                                    model_type: modelType
                                };
                            } else if (typeof metricData === 'number' || (typeof metricData === 'string' && !isNaN(parseFloat(metricData)))) {
                                extractedData[noiseType].factors[factorStr][modelName] = {
                                    value: parseFloat(metricData),
                                    std: 0.0,
                                    model_type: modelType
                                };
                            }
                        }
                    }
                }
            }
        });

        return extractedData;
    }

    /**
     * 计算R分数 (Robustness Score)
     * @param {Array} results - 模型结果数组
     * @returns {Object} R分数 {noise_type: {model_name: [R_scores]}}
     */
    static computeRScores(results) {
        const RScores = {}; // {noise_type: {model_name: [R_values]}}

        // 提取所有PSNR值用于全局归一化
        const allPsnrValues = [];
        results.forEach(result => {
            if (result.robustnessresult) {
                for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
                    if (noiseType === 'No Attacking') continue;

                    if (noiseData.factors) {
                        for (const factorData of Object.values(noiseData.factors)) {
                            if (factorData.visualquality && factorData.visualquality.PSNR) {
                                const psnrData = factorData.visualquality.PSNR;
                                if (Array.isArray(psnrData)) {
                                    psnrData.forEach(val => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num) && isFinite(num)) {
                                            allPsnrValues.push(num);
                                        }
                                    });
                                } else {
                                    const num = parseFloat(psnrData);
                                    if (!isNaN(num) && isFinite(num)) {
                                        allPsnrValues.push(num);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (allPsnrValues.length === 0) {
            console.warn('No PSNR values found for normalization');
            return RScores;
        }

        const globalMinPsnr = Math.min(...allPsnrValues);
        const globalMaxPsnr = Math.max(...allPsnrValues);

        // 计算R分数
        results.forEach(result => {
            const modelName = result.modelname || 'Unknown';

            if (!result.robustnessresult) return;

            for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
                if (noiseType === 'No Attacking') continue;

                if (!RScores[noiseType]) {
                    RScores[noiseType] = {};
                }

                if (!RScores[noiseType][modelName]) {
                    RScores[noiseType][modelName] = [];
                }

                // 处理每个因子
                if (noiseData.factors) {
                    for (const [factorStr, factorData] of Object.entries(noiseData.factors)) {
                        // 提取准确率值 (转换为0-1范围)
                        let accuracyValues = [];
                        // 尝试 TPR@n%FPR 模式
                        for (const key of Object.keys(factorData)) {
                            if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                                const tprData = factorData[key];
                                if (Array.isArray(tprData)) {
                                    accuracyValues = tprData.map(val => {
                                        const num = parseFloat(val);
                                        return !isNaN(num) && isFinite(num) ? (num + 1) / 2 : 0;
                                    }).filter(val => !isNaN(val) && isFinite(val));
                                } else {
                                    const num = parseFloat(tprData);
                                    if (!isNaN(num) && isFinite(num)) {
                                        accuracyValues = [(num + 1) / 2];
                                    }
                                }
                                break;
                            }
                        }

                        // 如果没有TPR@n%FPR，则尝试 Extract Accuracy
                        if (accuracyValues.length === 0 && factorData['Extract Accuracy']) {
                            const eaData = factorData['Extract Accuracy'];
                            if (Array.isArray(eaData)) {
                                accuracyValues = eaData.map(val => {
                                    const num = parseFloat(val);
                                    return !isNaN(num) && isFinite(num) ? num : 0;
                                }).filter(val => !isNaN(val) && isFinite(val));
                            } else {
                                const num = parseFloat(eaData);
                                if (!isNaN(num) && isFinite(num)) {
                                    accuracyValues = [num];
                                }
                            }
                        }

                        if (accuracyValues.length === 0) continue;

                        // 提取PSNR值
                        let psnrValues = [];
                        if (factorData.visualquality && factorData.visualquality.PSNR) {
                            const psnrData = factorData.visualquality.PSNR;
                            if (Array.isArray(psnrData)) {
                                psnrValues = psnrData.map(val => {
                                    const num = parseFloat(val);
                                    return !isNaN(num) && isFinite(num) ? num : 0;
                                }).filter(val => !isNaN(val) && isFinite(val));
                            } else {
                                const num = parseFloat(psnrData);
                                if (!isNaN(num) && isFinite(num)) {
                                    psnrValues = [num];
                                }
                            }
                        }

                        // 确保长度一致
                        const minLength = Math.min(accuracyValues.length, psnrValues.length);
                        if (minLength === 0) continue;

                        accuracyValues = accuracyValues.slice(0, minLength);
                        psnrValues = psnrValues.slice(0, minLength);

                        // 计算R分数
                        for (let i = 0; i < minLength; i++) {
                            const A = Math.max(0, Math.min(1, accuracyValues[i])); // 确保在0-1范围内
                            const psnr = psnrValues[i];

                            // 全局归一化PSNR
                            let psnrNorm = 0;
                            if (globalMaxPsnr > globalMinPsnr) {
                                psnrNorm = (psnr - globalMinPsnr) / (globalMaxPsnr - globalMinPsnr);
                            }
                            psnrNorm = Math.max(0, Math.min(1, psnrNorm)); // 确保在0-1范围内

                            // 计算R分数
                            const R = A * (1 - psnrNorm);
                            RScores[noiseType][modelName].push(R);
                        }
                    }
                }
            }
        });

        return RScores;
    }

    /**
     * 计算E分数 (Effectiveness Score)
     * @param {Array} results - 模型结果数组
     * @returns {Object} E分数 {noise_type: {model_name: [E_scores]}}
     */
    static computeEScores(results) {
        const EScores = {}; // {noise_type: {model_name: [E_values]}}

        // 提取所有PSNR值用于全局归一化
        const allPsnrValues = [];
        results.forEach(result => {
            if (result.robustnessresult) {
                for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
                    if (noiseType === 'No Attacking') continue;

                    if (noiseData.factors) {
                        for (const factorData of Object.values(noiseData.factors)) {
                            if (factorData.visualquality && factorData.visualquality.PSNR) {
                                const psnrData = factorData.visualquality.PSNR;
                                if (Array.isArray(psnrData)) {
                                    psnrData.forEach(val => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num) && isFinite(num)) {
                                            allPsnrValues.push(num);
                                        }
                                    });
                                } else {
                                    const num = parseFloat(psnrData);
                                    if (!isNaN(num) && isFinite(num)) {
                                        allPsnrValues.push(num);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (allPsnrValues.length === 0) {
            console.warn('No PSNR values found for normalization');
            return EScores;
        }

        const globalMinPsnr = Math.min(...allPsnrValues);
        const globalMaxPsnr = Math.max(...allPsnrValues);

        // 计算E分数
        results.forEach(result => {
            const modelName = result.modelname || 'Unknown';

            if (!result.robustnessresult) return;

            for (const [noiseType, noiseData] of Object.entries(result.robustnessresult)) {
                if (noiseType === 'No Attacking') continue;

                if (!EScores[noiseType]) {
                    EScores[noiseType] = {};
                }

                if (!EScores[noiseType][modelName]) {
                    EScores[noiseType][modelName] = [];
                }

                // 处理每个因子
                if (noiseData.factors) {
                    for (const [factorStr, factorData] of Object.entries(noiseData.factors)) {
                        // 提取准确率值 (转换为0-1范围)
                        let accuracyValues = [];
                        // 尝试 TPR@n%FPR 模式
                        for (const key of Object.keys(factorData)) {
                            if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                                const tprData = factorData[key];
                                if (Array.isArray(tprData)) {
                                    accuracyValues = tprData.map(val => {
                                        const num = parseFloat(val);
                                        return !isNaN(num) && isFinite(num) ? (num + 1) / 2 : 0;
                                    }).filter(val => !isNaN(val) && isFinite(val));
                                } else {
                                    const num = parseFloat(tprData);
                                    if (!isNaN(num) && isFinite(num)) {
                                        accuracyValues = [(num + 1) / 2];
                                    }
                                }
                                break;
                            }
                        }

                        // 如果没有TPR@n%FPR，则尝试 Extract Accuracy
                        if (accuracyValues.length === 0 && factorData['Extract Accuracy']) {
                            const eaData = factorData['Extract Accuracy'];
                            if (Array.isArray(eaData)) {
                                accuracyValues = eaData.map(val => {
                                    const num = parseFloat(val);
                                    return !isNaN(num) && isFinite(num) ? num : 0;
                                }).filter(val => !isNaN(val) && isFinite(val));
                            } else {
                                const num = parseFloat(eaData);
                                if (!isNaN(num) && isFinite(num)) {
                                    accuracyValues = [num];
                                }
                            }
                        }

                        if (accuracyValues.length === 0) continue;

                        // 提取PSNR值
                        let psnrValues = [];
                        if (factorData.visualquality && factorData.visualquality.PSNR) {
                            const psnrData = factorData.visualquality.PSNR;
                            if (Array.isArray(psnrData)) {
                                psnrValues = psnrData.map(val => {
                                    const num = parseFloat(val);
                                    return !isNaN(num) && isFinite(num) ? num : 0;
                                }).filter(val => !isNaN(val) && isFinite(val));
                            } else {
                                const num = parseFloat(psnrData);
                                if (!isNaN(num) && isFinite(num)) {
                                    psnrValues = [num];
                                }
                            }
                        }

                        // 确保长度一致
                        const minLength = Math.min(accuracyValues.length, psnrValues.length);
                        if (minLength === 0) continue;

                        accuracyValues = accuracyValues.slice(0, minLength);
                        psnrValues = psnrValues.slice(0, minLength);

                        // 计算E分数
                        for (let i = 0; i < minLength; i++) {
                            const A = Math.max(0, Math.min(1, accuracyValues[i])); // 确保在0-1范围内
                            const psnr = psnrValues[i];

                            // 全局归一化PSNR
                            let psnrNorm = 0;
                            if (globalMaxPsnr > globalMinPsnr) {
                                psnrNorm = (psnr - globalMinPsnr) / (globalMaxPsnr - globalMinPsnr);
                            }
                            psnrNorm = Math.max(0, Math.min(1, psnrNorm)); // 确保在0-1范围内

                            const E = psnrNorm * (1 - A);
                            EScores[noiseType][modelName].push(E);
                        }
                    }
                }
            }
        });

        return EScores;
    }
}

window.DataProcessor = DataProcessor;