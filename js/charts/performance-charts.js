// js/charts/performance-charts.js
// 性能分析图表渲染模块 - v3.0 Plotly加载检查版

/**
 * 检查Plotly是否可用的全局函数
 */
function waitForPlotly(callback, maxRetries = 50) {
    let retries = 0;
    
    function check() {
        if (typeof Plotly !== 'undefined') {
            console.log('Plotly is now available!');
            callback();
            return;
        }
        
        retries++;
        if (retries >= maxRetries) {
            console.error('Plotly failed to load after maximum retries');
            return;
        }
        
        console.log(`Waiting for Plotly to load... (${retries}/${maxRetries})`);
        setTimeout(check, 100);
    }
    
    check();
}

/**
 * 数据验证和清理函数
 * 清理所有传递给Plotly的数据，移除NaN、Infinity等无效值
 */
function sanitizeTraceData(trace) {
    if (!trace) return trace;
    
    const sanitizedTrace = { ...trace };
    
    // 只处理数字数组，保持其他数据不变
    if (sanitizedTrace.x && Array.isArray(sanitizedTrace.x)) {
        sanitizedTrace.x = sanitizedTrace.x.map(val => {
            if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
                return 0;
            }
            return val;
        });
    }
    
    if (sanitizedTrace.y && Array.isArray(sanitizedTrace.y)) {
        sanitizedTrace.y = sanitizedTrace.y.map(val => {
            if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
                return 0;
            }
            return val;
        });
    }
    
    // 对于text数组，只处理数字类型的元素
    if (sanitizedTrace.text && Array.isArray(sanitizedTrace.text)) {
        sanitizedTrace.text = sanitizedTrace.text.map(val => {
            if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
                return '0';
            }
            return val;
        });
    }
    
    return sanitizedTrace;
}

/**
 * 安全的safeNewPlot包装函数
 */
function safeNewPlot(containerId, traces, layout, config, retryCount = 0) {
    const maxRetries = 10; // 减少最大重试次数
    
    try {
        // 检查Plotly是否可用
        if (typeof Plotly === 'undefined') {
            if (retryCount >= maxRetries) {
                console.error(`Plotly failed to load after ${maxRetries} retries, waiting for plotlyReady event...`);
                // 等待plotlyReady事件
                const waitForPlotly = () => {
                    const listener = () => {
                        console.log('plotlyReady event received, rendering chart now');
                        window.removeEventListener('plotlyReady', listener);
                        setTimeout(() => {
                            safeNewPlot(containerId, traces, layout, config, 0); // 重置重试计数
                        }, 100);
                    };
                    window.addEventListener('plotlyReady', listener);
                    
                    // 设置超时，如果5秒后还没有事件，显示错误
                    setTimeout(() => {
                        window.removeEventListener('plotlyReady', listener);
                        console.error('Plotly loading timeout');
                        const container = document.getElementById(containerId);
                        if (container) {
                            container.innerHTML = '<p style="text-align: center; color: #e74c3c; padding: 20px; font-size: 14px;">图表加载超时，请检查网络连接后刷新页面</p>';
                        }
                    }, 5000);
                };
                waitForPlotly();
                return;
            }
            
            console.log(`Plotly not loaded yet. Retry ${retryCount + 1}/${maxRetries}`);
            // 延迟重试，传递递增的重试计数
            setTimeout(() => {
                safeNewPlot(containerId, traces, layout, config, retryCount + 1);
            }, 200); // 增加重试间隔
            return;
        }
        
        // Plotly已加载，执行渲染
        console.log(`Plotly loaded! Rendering chart for container: ${containerId}`);
        
        // 清空容器
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
        
        // 只清理trace数据，保持layout不变
        const sanitizedTraces = traces.map(trace => sanitizeTraceData(trace));
        return Plotly.newPlot(containerId, sanitizedTraces, layout, config);
    } catch (error) {
        console.error('Plotly rendering error:', error);
        console.log('Container ID:', containerId);
        console.log('Traces:', traces);
        console.log('Layout:', layout);
        
        // 如果还是出错，显示错误消息
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: #e74c3c; padding: 20px; font-size: 14px;">图表渲染出错，请检查数据格式</p>';
        }
        return Promise.reject(error);
    }
}

// 添加一个全局Plotly就绪检查函数
function isPlotlyReady() {
    return typeof Plotly !== 'undefined' && Plotly.newPlot;
}

// 添加一个等待Plotly就绪的Promise函数
function waitForPlotly() {
    return new Promise((resolve, reject) => {
        if (isPlotlyReady()) {
            resolve();
            return;
        }
        
        const checkInterval = setInterval(() => {
            if (isPlotlyReady()) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                resolve();
            }
        }, 100);
        
        const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Plotly loading timeout'));
        }, 10000); // 10秒超时
        
        // 监听plotlyReady事件
        const listener = () => {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            window.removeEventListener('plotlyReady', listener);
            resolve();
        };
        window.addEventListener('plotlyReady', listener);
    });
}
let globalModelColors = {};
// 全局攻击颜色方案
let globalAttackColors = {};

/**
 * 将LaTeX格式转换为Unicode字符
 * @param {string} latexStr - LaTeX字符串
 * @returns {string} Unicode字符串
 */
function convertLatexToUnicode(latexStr) {
    if (!latexStr) return latexStr;
    
    let result = latexStr;
    
    // 首先处理复杂的LaTeX结构（下标、上标等）
    // 处理下标 _{...}
    result = result.replace(/\$?([a-zA-Z\\]+)_\{([^}]+)\}\$?/g, (match, base, subscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const subChars = convertSubscriptText(subscript);
        return baseChar + subChars;
    });
    
    // 处理上标 ^{...}
    result = result.replace(/\$?([a-zA-Z\\]+)\^\{([^}]+)\}\$?/g, (match, base, superscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const supChars = convertSuperscriptText(superscript);
        return baseChar + supChars;
    });
    
    // 处理同时有上标和下标的情况 _{...}^{...} 或 ^{...}_{...}
    result = result.replace(/\$?([a-zA-Z\\]+)_\{([^}]+)\}\^\{([^}]+)\}\$?/g, (match, base, subscript, superscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const subChars = convertSubscriptText(subscript);
        const supChars = convertSuperscriptText(superscript);
        return baseChar + subChars + supChars;
    });
    
    result = result.replace(/\$?([a-zA-Z\\]+)\^\{([^}]+)\}_\{([^}]+)\}\$?/g, (match, base, superscript, subscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const subChars = convertSubscriptText(subscript);
        const supChars = convertSuperscriptText(superscript);
        return baseChar + subChars + supChars;
    });
    
    // 处理简单的单字符下标上标（不带花括号）
    result = result.replace(/\$?([a-zA-Z\\]+)_([a-zA-Z0-9])\$?/g, (match, base, subscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const subChar = convertSubscriptText(subscript);
        return baseChar + subChar;
    });
    
    result = result.replace(/\$?([a-zA-Z\\]+)\^([a-zA-Z0-9])\$?/g, (match, base, superscript) => {
        const baseChar = convertSingleLatexSymbol(base);
        const supChar = convertSuperscriptText(superscript);
        return baseChar + supChar;
    });
    
    // 常见的LaTeX符号映射到Unicode
    const latexToUnicode = {
        // 希腊字母（小写）
        '$\\alpha$': 'α', '$\\beta$': 'β', '$\\gamma$': 'γ', '$\\delta$': 'δ',
        '$\\epsilon$': 'ε', '$\\zeta$': 'ζ', '$\\eta$': 'η', '$\\theta$': 'θ',
        '$\\iota$': 'ι', '$\\kappa$': 'κ', '$\\lambda$': 'λ', '$\\mu$': 'μ',
        '$\\nu$': 'ν', '$\\xi$': 'ξ', '$\\omicron$': 'ο', '$\\pi$': 'π',
        '$\\rho$': 'ρ', '$\\sigma$': 'σ', '$\\tau$': 'τ', '$\\upsilon$': 'υ',
        '$\\phi$': 'φ', '$\\chi$': 'χ', '$\\psi$': 'ψ', '$\\omega$': 'ω',
        
        // 希腊字母（大写）
        '$\\Alpha$': 'Α', '$\\Beta$': 'Β', '$\\Gamma$': 'Γ', '$\\Delta$': 'Δ',
        '$\\Epsilon$': 'Ε', '$\\Zeta$': 'Ζ', '$\\Eta$': 'Η', '$\\Theta$': 'Θ',
        '$\\Iota$': 'Ι', '$\\Kappa$': 'Κ', '$\\Lambda$': 'Λ', '$\\Mu$': 'Μ',
        '$\\Nu$': 'Ν', '$\\Xi$': 'Ξ', '$\\Omicron$': 'Ο', '$\\Pi$': 'Π',
        '$\\Rho$': 'Ρ', '$\\Sigma$': 'Σ', '$\\Tau$': 'Τ', '$\\Upsilon$': 'Υ',
        '$\\Phi$': 'Φ', '$\\Chi$': 'Χ', '$\\Psi$': 'Ψ', '$\\Omega$': 'Ω',
        
        // 普通字母变量（斜体效果用Unicode数学字母）
        '$a$': '𝑎', '$b$': '𝑏', '$c$': '𝑐', '$d$': '𝑑', '$e$': '𝑒',
        '$f$': '𝑓', '$g$': '𝑔', '$h$': 'ℎ', '$i$': '𝑖', '$j$': '𝑗',
        '$k$': '𝑘', '$l$': '𝑙', '$m$': '𝑚', '$n$': '𝑛', '$o$': '𝑜',
        '$p$': '𝑝', '$q$': '𝑞', '$r$': '𝑟', '$s$': '𝑠', '$t$': '𝑡',
        '$u$': '𝑢', '$v$': '𝑣', '$w$': '𝑤', '$x$': '𝑥', '$y$': '𝑦',
        '$z$': '𝑧',
        
        '$A$': '𝐴', '$B$': '𝐵', '$C$': '𝐶', '$D$': '𝐷', '$E$': '𝐸',
        '$F$': '𝐹', '$G$': '𝐺', '$H$': '𝐻', '$I$': '𝐼', '$J$': '𝐽',
        '$K$': '𝐾', '$L$': '𝐿', '$M$': '𝑀', '$N$': '𝑁', '$O$': '𝑂',
        '$P$': '𝑃', '$Q$': '𝑄', '$R$': '𝑅', '$S$': '𝑆', '$T$': '𝑇',
        '$U$': '𝑈', '$V$': '𝑉', '$W$': '𝑊', '$X$': '𝑋', '$Y$': '𝑌',
        '$Z$': '𝑍',
        
        // 数学符号
        '$\\infty$': '∞', '$\\pm$': '±', '$\\times$': '×', '$\\div$': '÷',
        '$\\sqrt$': '√', '$\\sum$': '∑', '$\\prod$': '∏', '$\\int$': '∫',
        '$\\partial$': '∂', '$\\nabla$': '∇', '$\\leq$': '≤', '$\\geq$': '≥',
        '$\\neq$': '≠', '$\\approx$': '≈', '$\\equiv$': '≡', '$\\propto$': '∝',
        '$\\in$': '∈', '$\\subset$': '⊂', '$\\supset$': '⊃', '$\\cup$': '∪',
        '$\\cap$': '∩', '$\\rightarrow$': '→', '$\\leftarrow$': '←',
        '$\\leftrightarrow$': '↔', '$\\Rightarrow$': '⇒', '$\\Leftarrow$': '⇐',
        '$\\Leftrightarrow$': '⇔',
        
        // 没有$符号的简化版本（希腊字母）
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
        '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
        '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
        '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
        '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
        '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
        
        // 没有$符号的简化版本（普通字母）
        'q': '𝑞', 'c': '𝑐', 'a': '𝑎', 'b': '𝑏', 'd': '𝑑', 'e': '𝑒',
        'f': '𝑓', 'g': '𝑔', 'h': 'ℎ', 'i': '𝑖', 'j': '𝑗', 'k': '𝑘',
        'l': '𝑙', 'm': '𝑚', 'n': '𝑛', 'o': '𝑜', 'p': '𝑝', 'r': '𝑟',
        's': '𝑠', 't': '𝑡', 'u': '𝑢', 'v': '𝑣', 'w': '𝑤', 'x': '𝑥',
        'y': '𝑦', 'z': '𝑧'
    };
    
    // 按长度排序，先处理较长的模式，避免部分匹配
    const sortedEntries = Object.entries(latexToUnicode)
        .sort(([a], [b]) => b.length - a.length);
    
    for (const [latex, unicode] of sortedEntries) {
        const regex = new RegExp(latex.replace(/[\$\\]/g, '\\$&'), 'g');
        if (regex.test(result)) {
            result = result.replace(regex, unicode);
        }
    }
    
    return result;
}

/**
 * 转换单个LaTeX符号为Unicode
 * @param {string} symbol - LaTeX符号
 * @returns {string} Unicode字符
 */
function convertSingleLatexSymbol(symbol) {
    const symbolMap = {
        // 希腊字母
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
        '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
        '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
        '\\phi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
        // 普通字母
        'q': '𝑞', 'c': '𝑐', 'a': '𝑎', 'b': '𝑏', 'd': '𝑑', 'e': '𝑒',
        'f': '𝑓', 'g': '𝑔', 'h': 'ℎ', 'i': '𝑖', 'j': '𝑗', 'k': '𝑘',
        'l': '𝑙', 'm': '𝑚', 'n': '𝑛', 'o': '𝑜', 'p': '𝑝', 'r': '𝑟',
        's': '𝑠', 't': '𝑡', 'u': '𝑢', 'v': '𝑣', 'w': '𝑤', 'x': '𝑥',
        'y': '𝑦', 'z': '𝑧'
    };
    
    return symbolMap[symbol] || symbol;
}

/**
 * 转换文本为下标Unicode字符
 * @param {string} text - 要转换为下标的文本
 * @returns {string} 下标Unicode字符
 */
function convertSubscriptText(text) {
    const subscriptMap = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
        'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
        'v': 'ᵥ', 'x': 'ₓ',
        '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎'
    };
    
    return text.split('').map(char => subscriptMap[char] || char).join('');
}

/**
 * 转换文本为上标Unicode字符
 * @param {string} text - 要转换为上标的文本
 * @returns {string} 上标Unicode字符
 */
function convertSuperscriptText(text) {
    const superscriptMap = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
        'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
        'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
        'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
        'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾'
    };
    
    return text.split('').map(char => superscriptMap[char] || char).join('');
}

/**
 * 初始化全局模型颜色
 * @param {Array} modelsData - 模型数据数组
 */
function initializeGlobalModelColors(modelsData) {
    const modelNames = [...new Set(modelsData.map(data => data.modelname))].sort();
    globalModelColors = DataProcessor.getConsistentColors(modelNames);
}

/**
 * 初始化全局攻击颜色
 * @param {Array} modelsData - 模型数据数组
 */
function initializeGlobalAttackColors(modelsData) {
    const attackTypes = new Set();
    modelsData.forEach(modelData => {
        if (modelData.robustnessresult) {
            Object.keys(modelData.robustnessresult).forEach(attackType => {
                if (attackType !== 'No Attacking') {
                    attackTypes.add(attackType);
                }
            });
        }
    });
    
    const attackNames = Array.from(attackTypes).sort();
    globalAttackColors = DataProcessor.getConsistentColors(attackNames);
}

/**
 * 获取模型颜色
 * @param {string} modelName - 模型名称
 * @returns {string} 颜色值
 */
function getModelColor(modelName) {
    return globalModelColors[modelName] || '#6c757d';
}

/**
 * 获取攻击颜色
 * @param {string} attackName - 攻击名称
 * @returns {string} 颜色值
 */
function getAttackColor(attackName) {
    return globalAttackColors[attackName] || '#6c757d';
}

/**
 * 渲染总体鲁棒性排名的Hero View
 * 冠军居中，亚军季军左右排列的水平柱状图
 * 使用基于AUC的排名点数系统，与Python实现保持一致
 * @param {Array} modelsData - 模型数据数组
 */
function renderOverallRankingHero(modelsData) {
    const container = document.getElementById('overall-ranking-hero');
    if (!container || !modelsData || modelsData.length === 0) {
        if (container) {
            container.innerHTML = '<p class="loading-message">No available data</p>';
        }
        return;
    }

    // 完全清空容器
    container.innerHTML = '';

    // 初始化全局颜色方案
    initializeGlobalModelColors(modelsData);
    
    // 计算基于AUC的排名点数，与Python实现保持一致
    const aucScores = computeAUCScores(modelsData);
    
    // 计算排名点数系统的总分
    const rankingScores = computeRankingBasedScores(aucScores);
    
    // 获取有效模型的排名分数
    const finalScores = {};
    for (const [modelName, score] of Object.entries(rankingScores)) {
        if (!isNaN(score) && isFinite(score) && score > 0) {
            finalScores[modelName] = score;
        }
    }

    // 按分数排序（排名点数系统：分数越高排名越好）
    const sortedModels = Object.entries(finalScores)
        .sort(([,a], [,b]) => (b || 0) - (a || 0))
        .map(([name, score]) => ({ name, score: score || 0 }));

    if (sortedModels.length === 0) {
        container.innerHTML = '<p class="loading-message">No available ranking data</p>';
        return;
    }

    // 创建冠军居中的布局数据
    const layoutData = createChampionCenteredLayout(sortedModels);

    // 渲染垂直柱状图（冠军居中布局）
    const trace = {
        x: layoutData.map(item => item.displayName),
        y: layoutData.map(item => item.score),
        type: 'bar',
        width: 0.6, // 调整柱子宽度
        marker: {
            color: layoutData.map(item => {
                const baseColor = getModelColor(item.name);
                // 为柱状图添加渐变效果（使用更亮的版本）
                return baseColor;
            }),
            line: {
                color: 'rgba(255, 255, 255, 0.8)', // 使用白色边框提高对比度
                width: 2
            },
            // 添加阴影效果
            opacity: 0.9
        },
        text: layoutData.map(item => Math.round(item.score || 0).toString()),
        textposition: 'outside',
        textfont: {
            color: '#2c3e50',
            size: 16, // 增加数值标签字体大小
            family: 'Arial, sans-serif',
            weight: 'bold'
        }
    };

    const layout = {
        // 移除标题，让图表更简洁
        xaxis: {
            title: {
                text: 'Models',
                font: { size: 18, color: '#34495e' } // 增加X轴标题字体大小
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 更轻微的网格线
            showgrid: true, // 显示网格
            gridwidth: 1,
            tickangle: -45,
            tickfont: { size: 14 } // 增加X轴刻度标签字体大小
        },
        yaxis: {
            title: {
                text: 'Total Ranking Score (AUC-based)',
                font: { size: 18, color: '#34495e' } // 增加Y轴标题字体大小
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 更轻微的网格线
            showgrid: true, // 显示网格
            gridwidth: 1,
            tickfont: { size: 14 } // 增加Y轴刻度标签字体大小
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)', // 纯白背景更灵洁
        margin: {
            l: 70,
            r: 40,
            t: 30, // 减少顶部边距，因为去掉了标题
            b: 120
        },
        font: {
            family: 'Arial, sans-serif',
            size: 14, // 增加全局默认字体大小
            color: '#2c3e50'
        },
        autosize: true,
        annotations: createRankingAnnotations(layoutData, 0.6) // 传入柱子宽度参数
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(container, [trace], layout, config);
}

/**
 * 创建冠军居中的布局（水平柱状图变为垂直柱状图）
 * @param {Array} sortedModels - 已排序的模型数组
 * @returns {Array} 布局数据
 */
function createChampionCenteredLayout(sortedModels) {
    const layoutData = [];
    const totalModels = sortedModels.length;
    
    if (totalModels === 0) return layoutData;
    
    // 冠亚季军居中排列逻辑
    if (totalModels === 1) {
        // 只有一个模型
        const dataValue = sortedModels[0].score || sortedModels[0].value || 0;
        layoutData.push({
            name: sortedModels[0].name,
            score: dataValue,
            value: dataValue,
            rank: 1,
            position: 0, // 中心位置
            displayName: sortedModels[0].name
        });
    } else if (totalModels === 2) {
        // 两个模型：冠军在右，亚军在左
        const dataValue1 = sortedModels[1].score || sortedModels[1].value || 0;
        const dataValue0 = sortedModels[0].score || sortedModels[0].value || 0;
        layoutData.push(
            {
                name: sortedModels[1].name,
                score: dataValue1,
                value: dataValue1,
                rank: 2,
                position: -1,
                displayName: sortedModels[1].name
            },
            {
                name: sortedModels[0].name,
                score: dataValue0,
                value: dataValue0,
                rank: 1,
                position: 1,
                displayName: sortedModels[0].name
            }
        );
    } else {
        // 三个或更多模型：冠军居中，亚军左侧，季军右侧，其他按左右交替
        const positions = [0]; // 冠军在中心
        
        // 亚军在左侧，季军在右侧
        if (totalModels >= 2) positions.push(-1); // 亚军
        if (totalModels >= 3) positions.push(1);  // 季军
        
        // 其他模型交替排列
        let leftPos = -2;
        let rightPos = 2;
        for (let i = 3; i < totalModels; i++) {
            if (i % 2 === 1) {
                positions.push(leftPos--);
            } else {
                positions.push(rightPos++);
            }
        }
        
        // 按排序创建数据
        sortedModels.forEach((model, index) => {
            const dataValue = model.score || model.value || 0;
            layoutData.push({
                name: model.name,
                score: dataValue,
                value: dataValue,
                rank: index + 1,
                position: positions[index],
                displayName: model.name
            });
        });
    }
    
    // 按position排序以确保正确的显示顺序
    layoutData.sort((a, b) => a.position - b.position);
    
    return layoutData;
}

/**
 * 创建排名注释（适应垂直柱状图）
 * @param {Array} layoutData - 布局数据
 * @returns {Array} 注释数组
 */
/**
 * 创建排名注释（柱子内部显示，自适应大小）
 * @param {Array} layoutData - 布局数据
 * @param {number} barWidth - 柱子宽度（默认0.6）
 * @returns {Array} 注释数组
 */
function createRankingAnnotations(layoutData, barWidth = 0.6) {
    const annotations = [];
    
    // 根据柱子宽度计算图标大小（约为柱子宽度的2/3）
    // 柱子宽度范围通常是0.1-1.0，对应的字体大小范围是6-24
    const baseFontSize = Math.max(6, Math.min(24, barWidth * 40)); // 降低字体大小上限
    const medalFontSize = Math.max(12, baseFontSize * 1.0); // 奖牌符号最小12px
    const rankFontSize = Math.max(8, baseFontSize * 0.8);  // 排名数字最小8px
    
    // 计算全局最大值，用于判断柱子高度
    const maxValue = Math.max(...layoutData.map(item => item.score || item.value || 0));
    
    layoutData.forEach((item, index) => {
        // 使用score或value字段，取决于数据类型
        const dataValue = item.score || item.value || 0;
        
        // 判断柱子是否足够高（使用相对高度判断）
        const isShortBar = dataValue < maxValue * 0.3; // 如果柱子高度小于最大值的30%，认为是矮柱子
        
        // 根据柱子高度决定图标位置
        let iconYPosition;
        if (isShortBar) {
            // 矮柱子：图标显示在柱子顶部上方
            const offset = maxValue * 0.05; // 5%的偏移量
            iconYPosition = dataValue + offset;
        } else {
            // 正常高度柱子：图标显示在柱子中央
            iconYPosition = dataValue * 0.5;
        }
        
        if (item.rank <= 3) {
            // 添加奖牌符号注释
            let symbol = '';
            if (item.rank === 1) symbol = '🥇';
            else if (item.rank === 2) symbol = '🥈';
            else if (item.rank === 3) symbol = '🥉';
            
            annotations.push({
                x: item.displayName,
                y: iconYPosition,
                text: symbol,
                showarrow: false,
                font: {
                    size: medalFontSize,
                    family: 'Arial'
                }
                // 去掉所有边框设置
            });
        } else {
            // 其他排名显示 #ranking
            annotations.push({
                x: item.displayName,
                y: iconYPosition,
                text: `#${item.rank}`,
                showarrow: false,
                font: {
                    color: isShortBar ? '#2c3e50' : '#FFFFFF', // 矮柱子用深色，正常柱子用白色
                    size: rankFontSize,
                    family: 'Arial Black'
                }
                // 去掉所有边框设置
            });
        }
    });
    
    return annotations;
}

/**
 * 渲染各攻击器下的鲁棒性得分网格
 * @param {Array} modelsData - 模型数据数组
 */
function renderRobustnessScoresGrid(modelsData) {
    const container = document.getElementById('robustness-scores-grid');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    // 获取所有攻击类型
    const attackTypes = new Set();
    modelsData.forEach(modelData => {
        if (modelData.robustnessresult) {
            Object.keys(modelData.robustnessresult).forEach(attackType => {
                if (attackType !== 'No Attacking') {
                    attackTypes.add(attackType);
                }
            });
        }
    });

    const attackTypesArray = Array.from(attackTypes);
    
    if (attackTypesArray.length === 0) {
        container.innerHTML = '<p class="loading-message">No available attack data</p>';
        return;
    }

    // 为每个攻击类型创建图表
    attackTypesArray.forEach(attackType => {
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        
        const chartTitle = document.createElement('div');
        chartTitle.className = 'chart-title';
        chartTitle.textContent = attackType;
        
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.id = `robustness-score-${attackType.replace(/\s+/g, '-')}`;
        
        chartWrapper.appendChild(chartTitle);
        chartWrapper.appendChild(chartContainer);
        container.appendChild(chartWrapper);

        // 渲染单个攻击类型的柱状图
        renderSingleAttackScoreChart(chartContainer.id, attackType, modelsData);
    });
}

/**
 * 渲染单个攻击类型的得分图表（冠军居中排列）
 * 使用AUC计算，与Python实现保持一致
 * @param {string} containerId - 容器ID
 * @param {string} attackType - 攻击类型
 * @param {Array} modelsData - 模型数据
 */
function renderSingleAttackScoreChart(containerId, attackType, modelsData) {
    // 计算AUC分数
    const aucScores = computeAUCScores(modelsData);
    const modelScores = {};
    
    // 提取各模型在该攻击下的AUC得分
    for (const [modelName, noiseScores] of Object.entries(aucScores)) {
        if (noiseScores[attackType] !== undefined && isFinite(noiseScores[attackType])) {
            modelScores[modelName] = noiseScores[attackType];
        }
    }

    // 按得分排序并创建冠军居中布局
    const sortedModels = Object.entries(modelScores)
        .sort(([,a], [,b]) => b - a)
        .map(([name, score], index) => ({ name, score, rank: index + 1 }));

    if (sortedModels.length === 0) {
        document.getElementById(containerId).innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No data</p>';;
        return;
    }

    // 创建冠军居中的布局
    const layoutData = createChampionCenteredLayout(sortedModels);

    const trace = {
        x: layoutData.map(item => item.displayName),
        y: layoutData.map(item => item.score),
        type: 'bar',
        width: 0.6, // 调整柱子宽度
        marker: {
            color: layoutData.map(item => {
                const baseColor = getModelColor(item.name);
                // 为Robustness Scores添加现代化样式
                return baseColor;
            }),
            line: {
                color: 'rgba(255, 255, 255, 0.8)', // 使用白色边框提高对比度
                width: 2
            },
            // 添加阴影效果
            opacity: 0.9
        },
        text: layoutData.map(item => (item.score || 0).toFixed(3)),
        textposition: 'outside',
        textfont: {
            size: 11,
            color: '#2c3e50',
            weight: 'bold'
        }
    };

    const layout = {
        xaxis: {
            // 去除X轴标签—'Models'
            showticklabels: true,
            tickangle: -45,
            tickfont: { size: 10 },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true // 显示网格
        },
        yaxis: {
            title: {
                text: 'AUC Score',
                font: { size: 12, color: '#34495e' }
            },
            range: [0, Math.max(...layoutData.map(item => item.score || 0)) * 1.1],
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true // 显示网格
        },
        margin: {
            l: 50,
            r: 20,
            t: 20,
            b: 100 // 保持合理的底部边距
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)', // 纯白背景更灵洁
        height: 500, // 增加高度约1/4，Robustness Scores图表高度从400px到500px
        width: null, // 让宽度自适应
        annotations: createRankingAnnotations(layoutData, 0.6) // 传入柱子宽度参数
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(containerId, [trace], layout, config);
}

/**
 * 渲染各攻击器下的鲁棒性曲线网格（支持多指标显示）
 * @param {Array} modelsData - 模型数据数组
 */
function renderRobustnessCurvesGrid(modelsData) {
    const container = document.getElementById('robustness-curves-grid');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    // 获取所有攻击类型和指标
    const attackTypesData = {};
    modelsData.forEach(modelData => {
        if (modelData.robustnessresult) {
            Object.keys(modelData.robustnessresult).forEach(attackType => {
                if (attackType !== 'No Attacking') {
                    if (!attackTypesData[attackType]) {
                        attackTypesData[attackType] = {
                            metrics: new Set(),
                            factorsymbol: null
                        };
                    }
                    
                    // 获取指标和factorsymbol
                    const attackData = modelData.robustnessresult[attackType];
                    if (attackData.factorsymbol) {
                        attackTypesData[attackType].factorsymbol = attackData.factorsymbol;
                    }
                    
                    if (attackData.factors) {
                        for (const factorData of Object.values(attackData.factors)) {
                            // 收集所有可用指标
                            for (const key of Object.keys(factorData)) {
                                if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                                    attackTypesData[attackType].metrics.add(key);
                                } else if (key === 'Extract Accuracy') {
                                    attackTypesData[attackType].metrics.add(key);
                                }
                            }
                        }
                    }
                }
            });
        }
    });

    if (Object.keys(attackTypesData).length === 0) {
        container.innerHTML = '<p class="loading-message">No available attack data</p>';
        return;
    }

    // 为每个攻击类型和指标组合创建图表
    for (const [attackType, attackInfo] of Object.entries(attackTypesData)) {
        const metrics = Array.from(attackInfo.metrics);
        
        for (const metric of metrics) {
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'chart-wrapper';
            
            const chartTitle = document.createElement('div');
            chartTitle.className = 'chart-title';
            chartTitle.textContent = attackType; // 直接使用失真名字
            
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.id = `robustness-curve-${attackType.replace(/\s+/g, '-')}-${metric.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            chartWrapper.appendChild(chartTitle);
            chartWrapper.appendChild(chartContainer);
            container.appendChild(chartWrapper);

            // 渲染单个攻击类型和指标的曲线图
            renderSingleAttackCurveChart(chartContainer.id, attackType, metric, attackInfo.factorsymbol, modelsData);
        }
    }
}

/**
 * 渲染单个攻击类型的曲线图
 * @param {string} containerId - 容器ID
 * @param {string} attackType - 攻击类型
 * @param {string} targetMetric - 目标指标
 * @param {string} factorSymbol - 因子符号
 * @param {Array} modelsData - 模型数据
 */
function renderSingleAttackCurveChart(containerId, attackType, targetMetric, factorSymbol, modelsData) {
    const traces = [];
    let colorIndex = 0;
    
    // 为每个模型创建trace
    modelsData.forEach(modelData => {
        const modelName = modelData.modelname;
        let hasData = false;
        const xData = []; // 攻击强度因子
        const yData = []; // 指标值
        
        // 检查模型是否有该攻击的数据
        if (modelData.robustnessresult && modelData.robustnessresult[attackType]) {
            const attackData = modelData.robustnessresult[attackType];
            
            if (attackData.factors) {
                // 收集因子数据并排序
                const factorEntries = Object.entries(attackData.factors)
                    .filter(([factor]) => factor !== 'visualquality')
                    .map(([factor, data]) => ({
                        factor: parseFloat(factor) || 0,
                        factorStr: factor,
                        data: data
                    }))
                    .sort((a, b) => a.factor - b.factor);
                
                factorEntries.forEach(entry => {
                    // 使用指定的目标指标
                    if (entry.data[targetMetric]) {
                        const metricData = entry.data[targetMetric];
                        let metricValue = null;
                        
                        if (Array.isArray(metricData)) {
                            metricValue = metricData.reduce((sum, val) => sum + parseFloat(val), 0) / metricData.length;
                        } else {
                            metricValue = parseFloat(metricData);
                        }
                        
                        // 接受所有有效数值，包括0.0
                        if (metricValue !== null && !isNaN(metricValue) && isFinite(metricValue)) {
                            xData.push(entry.factor);
                            yData.push(metricValue);
                            hasData = true;
                        }
                    }
                });
            }
        }
        
        // 为每个模型都添加trace，无论是否有数据
        if (hasData && xData.length > 0) {
            // 判断是否只有一个数据点，如果是则使用柱状图，否则使用折线图
            if (xData.length === 1) {
                // 单点数据使用柱状图
                traces.push({
                    x: [attackType], // 使用攻击类型作为X轴标签
                    y: yData,
                    type: 'bar',
                    name: modelName,
                    marker: {
                        color: getModelColor(modelName),
                        line: {
                            color: '#2c3e50',
                            width: 1
                        }
                    },
                    text: yData.map(val => val.toFixed(3)),
                    textposition: 'outside',
                    textfont: {
                        size: 10,
                        color: '#2c3e50'
                    }
                });
            } else {
                // 多点数据使用折线图
                traces.push({
                    x: xData,
                    y: yData,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: modelName,
                    line: {
                        color: getModelColor(modelName),
                        width: 3
                    },
                    marker: {
                        size: 8,
                        color: getModelColor(modelName)
                    }
                });
            }
        }
        colorIndex++;
    });

    if (traces.length === 0) {
        document.getElementById(containerId).innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No data</p>';
        return;
    }

    // 配置X轴标签 - 简化版本，使用Attack Strength
    const xAxisConfig = {
        title: {
            text: 'Attack Strength',
            font: { size: 14, color: '#34495e' }
        },
        gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
        showgrid: true // 显示网格
    };

    // 计算Y轴范围 - 根据实际数据动态设置
    const allYValues = traces.flatMap(trace => trace.y || []).filter(y => y !== null && isFinite(y));
    let yAxisRange;
    
    if (allYValues.length > 0) {
        const minY = Math.min(...allYValues);
        const maxY = Math.max(...allYValues);
        
        // 根据数据范围智能判断Y轴配置
        if (targetMetric === 'Extract Accuracy' || (maxY > 10 && maxY <= 105)) {
            // Extract Accuracy 或其他百分比指标，使用0-100范围
            yAxisRange = [0, Math.max(100, maxY * 1.1)];
        } else if (maxY <= 1.2 && minY >= -0.2) {
            // TPR@N%FPR等比率指标，使用0-1范围
            yAxisRange = [0, 1];
        } else {
            // 使用数据的实际范围，添加10%的边距
            const margin = (maxY - minY) * 0.1;
            yAxisRange = [Math.max(0, minY - margin), maxY + margin];
        }
    } else {
        // 默认范围：根据指标类型决定
        if (targetMetric === 'Extract Accuracy') {
            yAxisRange = [0, 100];
        } else {
            yAxisRange = [0, 1];
        }
    }

    const layout = {
        xaxis: xAxisConfig,
        yaxis: {
            title: {
                text: targetMetric,
                font: { size: 14, color: '#34495e' }
            },
            range: yAxisRange,
            autorange: false, // 使用我们计算的范围
            fixedrange: false, // 允许用户缩放
            showgrid: true,
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 统一网格线颜色
            zeroline: true,
            zerolinecolor: '#d0d0d0'
        },
        margin: {
            l: 80,
            r: 20,
            t: 20,
            b: 100
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)', // 恢复原来的纸张背景色
        legend: {
            orientation: 'h', // 水平方向
            x: 0.5,
            y: -0.25, // 更往下一些，从-0.2调整到-0.25
            xanchor: 'center',
            yanchor: 'top',
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: 'rgba(0, 0, 0, 0.1)',
            borderwidth: 1
        },
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        },
        height: 550, // 调整为550px
        width: null // 让宽度自适应
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(containerId, traces, layout, config);
}

/**
 * 渲染攻击器有效性排名的旋转柱状图（垂直柱状图）
 * 使用AE = (1 - TPR@N%FPR) × PSNR_normalized公式，与Python实现保持一致
 * @param {Array} modelsData - 模型数据数组
 */
function renderAttackEffectivenessRanking(modelsData) {
    const container = document.getElementById('attack-effectiveness-ranking');
    if (!container || !modelsData || modelsData.length === 0) {
        if (container) {
            container.innerHTML = '<p class="loading-message">No available data</p>';
        }
        return;
    }

    // 完全清空容器
    container.innerHTML = '';

    // 初始化全局攻击颜色方案
    initializeGlobalAttackColors(modelsData);

    // 计算攻击有效性，使用与Python一致的方法
    const attackEffectiveness = computeAttackEffectiveness(modelsData);
    
    // 计算平均攻击有效性
    const avgAttackEffectiveness = {};
    for (const [attackType, values] of Object.entries(attackEffectiveness)) {
        if (values && values.length > 0) {
            avgAttackEffectiveness[attackType] = values.reduce((sum, val) => sum + val, 0) / values.length;
        }
    }

    // 按排名排序并创建冠军居中布局
    const sortedAttacks = Object.entries(avgAttackEffectiveness)
        .sort(([,a], [,b]) => b - a)
        .map(([name, value], index) => ({ name, value, rank: index + 1 }));

    if (sortedAttacks.length === 0) {
        container.innerHTML = '<p class="loading-message">No available attack effectiveness data</p>';
        return;
    }

    // 创建冠军居中的布局
    const layoutData = createChampionCenteredLayout(sortedAttacks);

    // 渲染垂直柱状图
    const trace = {
        x: layoutData.map(item => item.displayName),
        y: layoutData.map(item => item.value),
        type: 'bar',
        width: 0.6, // 调整柱子宽度
        marker: {
            color: layoutData.map((item, index) => {
                if (item.rank === 1) return '#FFD700'; // 金色 - 冠军
                if (item.rank === 2) return '#C0C0C0'; // 银色 - 亚军
                if (item.rank === 3) return '#CD7F32'; // 铜色 - 季军
                return getAttackColor(item.name); // 使用全局攻击颜色
            }),
            line: {
                color: '#2c3e50',
                width: 1
            }
        },
        text: layoutData.map(item => (item.value || 0).toFixed(3)),
        textposition: 'outside',
        textfont: {
            size: 12,
            color: '#2c3e50',
            family: 'Arial, sans-serif'
        }
    };

    const layout = {
        // 移除标题，让图表更简洁
        xaxis: {
            title: {
                text: 'Attack Type',
                font: { size: 16, color: '#34495e' }
            },
            tickangle: -45,
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true, // 显示网格
            showticklabels: true, // 显示攻击器名称
            tickfont: { size: 12 }
        },
        yaxis: {
            title: {
                text: 'Attack Effectiveness (AE)',
                font: { size: 16, color: '#34495e' }
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true, // 显示网格
            range: [0, Math.max(...layoutData.map(item => item.value || 0)) * 1.1]
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        margin: {
            l: 70,
            r: 40,
            t: 30, // 减少顶部边距，因为去掉了标题
            b: 100
        },
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        },
        autosize: true,
        annotations: createRankingAnnotations(layoutData, 0.6) // 传入柱子宽度参数，添加冠军注释
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(container, [trace], layout, config);
}

/**
 * 渲染各模型在不同攻击下的鲁棒性曲线（按模型分组）
 * @param {Array} modelsData - 模型数据数组
 */
function renderModelRobustnessCurves(modelsData) {
    const container = document.getElementById('model-robustness-curves');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    // 为每个模型创建图表
    modelsData.forEach(modelData => {
        const modelName = modelData.modelname;
        if (!modelData.robustnessresult) return;

        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        
        const chartTitle = document.createElement('div');
        chartTitle.className = 'chart-title';
        chartTitle.textContent = `${modelName} - Robustness under All Attacks`;
        
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.id = `model-curves-${modelName.replace(/\s+/g, '-')}`;
        
        chartWrapper.appendChild(chartTitle);
        chartWrapper.appendChild(chartContainer);
        container.appendChild(chartWrapper);

        // 渲染该模型的所有攻击曲线
        renderSingleModelAllAttacksCurves(chartContainer.id, modelName, modelData);
    });

    if (modelsData.length === 0) {
        container.innerHTML = '<p class="loading-message">No model data available</p>';
    }
}

/**
 * 渲染单个模型在所有攻击下的曲线
 * @param {string} containerId - 容器ID
 * @param {string} modelName - 模型名称
 * @param {Object} modelData - 模型数据
 */
function renderSingleModelAllAttacksCurves(containerId, modelName, modelData) {
    const traces = [];
    
    // 使用全局攻击颜色方案
    if (Object.keys(globalAttackColors).length === 0) {
        // 如果还没有初始化，就在这里初始化
        const attackTypes = Object.keys(modelData.robustnessresult).filter(type => type !== 'No Attacking');
        globalAttackColors = DataProcessor.getConsistentColors(attackTypes);
    }
    
    // 遍历所有攻击类型
    for (const [attackType, attackData] of Object.entries(modelData.robustnessresult)) {
        if (attackType === 'No Attacking') continue;
        
        const xData = []; // PSNR值
        const yData = []; // 检测准确率
        
        if (attackData.factors) {
            // 收集数据点
            for (const [factor, factorData] of Object.entries(attackData.factors)) {
                // 获取检测准确率和实际指标名称
                let accuracyValue = null;
                let actualMetricName = 'Extract Accuracy';
                
                // 优先查找TPR@N%FPR
                for (const key of Object.keys(factorData)) {
                    if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                        const tprData = factorData[key];
                        actualMetricName = key;
                        
                        if (Array.isArray(tprData)) {
                            accuracyValue = tprData.reduce((sum, val) => sum + parseFloat(val), 0) / tprData.length;
                        } else {
                            accuracyValue = parseFloat(tprData);
                        }
                        break;
                    }
                }
                
                // 如果没有TPR，使用Extract Accuracy
                if (accuracyValue === null && factorData['Extract Accuracy']) {
                    const accuracy = factorData['Extract Accuracy'];
                    actualMetricName = 'Extract Accuracy';
                    
                    if (Array.isArray(accuracy)) {
                        accuracyValue = accuracy.reduce((sum, val) => sum + parseFloat(val), 0) / accuracy.length;
                    } else {
                        accuracyValue = parseFloat(accuracy);
                    }
                }
                
                // 将指标名称保存到模型数据中以便后续使用
                if (!modelData._actualMetricName) {
                    modelData._actualMetricName = actualMetricName;
                }
                
                // 获取PSNR值
                let psnrValue = null;
                if (factorData.visualquality && factorData.visualquality.PSNR) {
                    const psnrData = factorData.visualquality.PSNR;
                    
                    if (Array.isArray(psnrData)) {
                        psnrValue = psnrData.reduce((sum, val) => sum + parseFloat(val), 0) / psnrData.length;
                    } else {
                        psnrValue = parseFloat(psnrData);
                    }
                }
                
                if (accuracyValue !== null && psnrValue !== null && 
                    !isNaN(accuracyValue) && !isNaN(psnrValue)) {
                    xData.push(psnrValue);
                    yData.push(accuracyValue);
                }
            }
        }
        
        if (xData.length > 0) {
            // 按PSNR值排序
            const sortedIndices = xData.map((_, i) => i)
                .sort((a, b) => xData[a] - xData[b]);
            
            const sortedX = sortedIndices.map(i => xData[i]);
            const sortedY = sortedIndices.map(i => yData[i]);
            
            traces.push({
                x: sortedX,
                y: sortedY,
                type: 'scatter',
                mode: 'lines+markers',
                name: attackType,
                line: {
                    color: getAttackColor(attackType), // 使用全局攻击颜色
                    width: 3
                },
                marker: {
                    size: 8,
                    color: getAttackColor(attackType)
                }
            });
        }
    }

    if (traces.length === 0) {
        document.getElementById(containerId).innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No data available</p>';
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
        xaxis: {
            title: 'PSNR (dB)',
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true // 显示网格
        },
        yaxis: {
            title: modelData._actualMetricName || 'Detection Accuracy',
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加网格线
            showgrid: true, // 显示网格
            range: yAxisRange, // 使用动态计算的范围
            autorange: false, // 使用我们计算的范围
            zeroline: true,   // 显示零线
            zerolinecolor: '#d0d0d0'
        },
        margin: {
            l: 70,
            r: 20,
            t: 20,
            b: 60 // 进一步减少底部边距，优化布局
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        legend: {
            orientation: 'h',
            y: -0.08, // 进一步将legend往上移动，更靠近X轴
            x: 0.5,
            xanchor: 'center'
        },
        autosize: true // 自动调整大小
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(containerId, traces, layout, config);
}

/**
 * 渲染失真图像可视化（按模型分区域布局）
 * @param {Array} modelsData - 模型数据数组
 */
function renderDistortionVisualization(modelsData) {
    const container = document.getElementById('distortion-visualization');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    modelsData.forEach(modelData => {
        const modelName = modelData.modelname;
        const visualCompareData = modelData.visualcompare;
        
        if (!visualCompareData || !visualCompareData.noise) {
            return; // 跳过没有失真图像数据的模型
        }

        // 为每个模型创建区域
        const modelSection = document.createElement('div');
        modelSection.className = 'model-distortion-section';
        modelSection.style.marginBottom = '40px';
        modelSection.style.padding = '20px';
        modelSection.style.backgroundColor = 'white';
        modelSection.style.borderRadius = '12px';
        modelSection.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.08)';

        // 模型标题
        const modelTitle = document.createElement('h3');
        modelTitle.textContent = `${modelName} - Distortion Effects`;
        modelTitle.style.textAlign = 'center';
        modelTitle.style.marginBottom = '20px';
        modelTitle.style.color = '#2c3e50';
        modelSection.appendChild(modelTitle);

        // 图像网格
        const imageGrid = document.createElement('div');
        imageGrid.className = 'distortion-image-grid';
        imageGrid.style.display = 'grid';
        imageGrid.style.gridTemplateColumns = 'repeat(8, 1fr)'; // 减少列数，让图像更大
        imageGrid.style.gap = '20px'; // 增加间距
        imageGrid.style.justifyItems = 'center';

        // 添加失真图像
        Object.entries(visualCompareData.noise).forEach(([noiseType, base64Image]) => {
            if (base64Image) {
                const imageCard = document.createElement('div');
                imageCard.className = 'distortion-image-card';
                imageCard.style.textAlign = 'center';
                imageCard.style.background = '#f8f9fa';
                imageCard.style.borderRadius = '8px';
                imageCard.style.padding = '10px';
                imageCard.style.transition = 'transform 0.2s ease';
                imageCard.style.cursor = 'pointer';

                // 图像
                const img = document.createElement('img');
                let src = base64Image;
                if (!src.startsWith('data:image')) {
                    src = `data:image/png;base64,${src}`;
                }
                img.src = src;
                img.alt = `${noiseType} distortion`;
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '6px';
                img.style.marginBottom = '8px';

                // 标签
                const label = document.createElement('div');
                label.textContent = noiseType;
                label.style.fontSize = '0.9rem'; // 增加字体大小
                label.style.color = '#6c757d';
                label.style.fontWeight = '500';
                label.style.wordBreak = 'break-word';
                label.style.padding = '5px 0'; // 增加内边距

                // 悬停效果
                imageCard.addEventListener('mouseenter', () => {
                    imageCard.style.transform = 'scale(1.05)';
                    imageCard.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.15)';
                });
                
                imageCard.addEventListener('mouseleave', () => {
                    imageCard.style.transform = 'scale(1)';
                    imageCard.style.boxShadow = 'none';
                });

                // 添加点击放大功能
                imageCard.addEventListener('click', () => {
                    showImageModal(src, `${modelName} - ${noiseType} Distortion`, modelData, 'distortion');
                });

                imageCard.appendChild(img);
                imageCard.appendChild(label);
                imageGrid.appendChild(imageCard);
            }
        });

        modelSection.appendChild(imageGrid);
        container.appendChild(modelSection);
    });

    if (container.children.length === 0) {
        container.innerHTML = '<p class="loading-message">No distortion visualization data available</p>';
    }
}

/**
 * 渲染视觉质量指标的小提琴图和分组柱状图
 * @param {Array} modelsData - 模型数据数组
 */
function renderQualityMetricsCharts(modelsData) {
    const container = document.getElementById('quality-metrics-charts');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    // 提取多值指标数据
    const multiValueMetrics = DataProcessor.extractMultiValueMetrics(modelsData);
    
    // 提取FID数据
    const fidData = DataProcessor.extractFidData(modelsData);

    // 为多值指标创建小提琴图
    Object.entries(multiValueMetrics).forEach(([metricName, metricData]) => {
        if (metricName === 'FID') return; // FID单独处理
        
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        
        const chartTitle = document.createElement('div');
        chartTitle.className = 'chart-title';
        chartTitle.textContent = `${metricName} Distribution (Violin Plot)`;
        
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.id = `violin-${metricName.toLowerCase()}`;
        
        chartWrapper.appendChild(chartTitle);
        chartWrapper.appendChild(chartContainer);
        container.appendChild(chartWrapper);

        // 渲染小提琴图
        renderViolinPlot(chartContainer.id, metricName, metricData);
    });

    // 为FID创建分组柱状图
    if (Object.keys(fidData).length > 0) {
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        
        const chartTitle = document.createElement('div');
        chartTitle.className = 'chart-title';
        chartTitle.textContent = 'FID Scores (Grouped Bar Chart)';
        
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.id = 'fid-grouped-bar';
        
        chartWrapper.appendChild(chartTitle);
        chartWrapper.appendChild(chartContainer);
        container.appendChild(chartWrapper);

        // 渲染FID分组柱状图
        renderFidGroupedBarChart('fid-grouped-bar', fidData);
    }

    if (container.children.length === 0) {
        container.innerHTML = '<p class="loading-message">No visual quality metrics data available</p>';
    }
}

/**
 * 渲染小提琴图
 * @param {string} containerId - 容器ID
 * @param {string} metricName - 指标名称
 * @param {Object} metricData - 指标数据
 */
function renderViolinPlot(containerId, metricName, metricData) {
    const traces = [];
    const modelNames = Object.keys(metricData);
    
    // 获取现代化颜色方案
    const modelColors = DataProcessor.getConsistentColors(modelNames);

    Object.entries(metricData).forEach(([modelName, values]) => {
        traces.push({
            y: values,
            type: 'violin',
            name: modelName,
            box: {
                visible: true
            },
            meanline: {
                visible: true
            },
            fillcolor: modelColors[modelName],
            line: {
                color: modelColors[modelName],
                width: 2
            },
            opacity: 0.8,
            x0: modelName
        });
    });

    const layout = {
        yaxis: {
            title: {
                text: metricName,
                font: { size: 16, color: '#34495e' }
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)',
            gridwidth: 1,
            tickfont: { size: 12 }
        },
        xaxis: {
            title: {
                text: 'Models',
                font: { size: 16, color: '#34495e' }
            },
            tickfont: { size: 12 }
        },
        margin: {
            l: 60,
            r: 20,
            t: 30,
            b: 120 // 增加底部边距以容纳图例
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        height: 600,
        width: null, // 让宽度自适应
        showlegend: true,
        legend: {
            orientation: 'h',
            x: 0.5,
            y: -0.25,
            xanchor: 'center',
            yanchor: 'top',
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: 'rgba(0, 0, 0, 0.1)',
            borderwidth: 1
        },
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        }
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(containerId, traces, layout, config);
}

/**
 * 渲染FID分组柱状图
 * @param {string} containerId - 容器ID
 * @param {Object} fidData - FID数据
 */
function renderFidGroupedBarChart(containerId, fidData) {
    const modelNames = Object.keys(fidData);
    const stegoFidValues = [];
    const cleanFidValues = [];

    modelNames.forEach(modelName => {
        const data = fidData[modelName];
        stegoFidValues.push(data.stego_fid || 0);
        cleanFidValues.push(data.clean_fid || 0);
    });

    // 获取现代化颜色方案
    const modelColors = DataProcessor.getConsistentColors(modelNames);

    const traces = [
        {
            x: modelNames,
            y: stegoFidValues,
            type: 'bar',
            name: 'Stego FID',
            marker: {
                color: modelNames.map(name => modelColors[name]),
                line: {
                    color: 'rgba(255, 255, 255, 0.8)',
                    width: 2
                },
                opacity: 0.9
            }
        }
    ];

    // 只有当有clean FID数据时才添加
    if (cleanFidValues.some(val => val > 0)) {
        traces.push({
            x: modelNames,
            y: cleanFidValues,
            type: 'bar',
            name: 'Clean FID',
            marker: {
                color: modelNames.map(name => modelColors[name]),
                pattern: {
                    shape: '/', // 斜线填充区分
                    bgcolor: 'rgba(255, 255, 255, 0.3)',
                    fgcolor: modelNames.map(name => modelColors[name]),
                    size: 8,
                    solidity: 0.3
                },
                line: {
                    color: 'rgba(255, 255, 255, 0.8)',
                    width: 2
                },
                opacity: 0.9
            }
        });
    }

    const layout = {
        barmode: 'group',
        yaxis: {
            title: {
                text: 'FID Score',
                font: { size: 16, color: '#34495e' }
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)',
            showgrid: true, // 显示网格
            gridwidth: 1,
            tickfont: { size: 12 }
        },
        xaxis: {
            title: {
                text: 'Models',
                font: { size: 16, color: '#34495e' }
            },
            tickangle: -45,
            tickfont: { size: 12 },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加X轴网格线
            showgrid: true // 显示网格
        },
        margin: {
            l: 60,
            r: 20,
            t: 30,
            b: 120 // 增加底部边距以容纳图例
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        height: 600,
        width: null, // 让宽度自适应
        showlegend: true,
        legend: {
            orientation: 'h',
            x: 0.5,
            y: -0.25,
            xanchor: 'center',
            yanchor: 'top',
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: 'rgba(0, 0, 0, 0.1)',
            borderwidth: 1
        },
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        }
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    safeNewPlot(containerId, traces, layout, config);
}

/**
 * 渲染Stego图像对比的按列布局展示
 * @param {Array} modelsData - 模型数据数组
 */
function renderStegoComparison(modelsData) {
    const container = document.getElementById('stego-comparison');
    if (!container) return;

    // 完全清空容器
    container.innerHTML = '';

    // 获取所有模型的stego数据
    const modelsWithStegoData = modelsData.filter(modelData => 
        modelData.visualcompare && modelData.visualcompare.stego
    );

    if (modelsWithStegoData.length === 0) {
        container.innerHTML = '<p class="loading-message">No stego comparison data available</p>';
        return;
    }

    // 创建按列布局的表格
    const comparisonTable = document.createElement('div');
    comparisonTable.style.display = 'grid';
    comparisonTable.style.gridTemplateColumns = `150px repeat(${modelsWithStegoData.length}, 1fr)`; // 增加列宽度
    comparisonTable.style.gap = '20px'; // 增加间距
    comparisonTable.style.padding = '25px'; // 增加内边距
    comparisonTable.style.backgroundColor = 'white';
    comparisonTable.style.borderRadius = '12px';
    comparisonTable.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.08)';

    // 添加表头（空格 + 模型名）
    const headerEmpty = document.createElement('div');
    headerEmpty.style.display = 'flex';
    headerEmpty.style.alignItems = 'center';
    headerEmpty.style.justifyContent = 'center';
    headerEmpty.style.fontWeight = 'bold';
    headerEmpty.style.color = '#2c3e50';
    headerEmpty.textContent = 'Image Type';
    comparisonTable.appendChild(headerEmpty);

    modelsWithStegoData.forEach(modelData => {
        const modelHeader = document.createElement('div');
        modelHeader.style.textAlign = 'center';
        modelHeader.style.fontWeight = 'bold';
        modelHeader.style.color = '#2c3e50';
        modelHeader.style.padding = '10px';
        modelHeader.style.backgroundColor = '#f8f9fa';
        modelHeader.style.borderRadius = '8px';
        modelHeader.textContent = modelData.modelname;
        comparisonTable.appendChild(modelHeader);
    });

    // 图像类型列表（根据数据动态确定）
    const imageTypes = [];
    const imageTypeLabels = {};
    
    // 检查数据中存在的图像类型
    const availableTypes = new Set();
    modelsWithStegoData.forEach(modelData => {
        const stegoData = modelData.visualcompare.stego;
        Object.keys(stegoData).forEach(key => {
            availableTypes.add(key);
        });
    });
    
    // 按优先级添加图像类型
    if (availableTypes.has('cover')) {
        imageTypes.push('cover');
        imageTypeLabels['cover'] = 'Cover/Clean';
    } else if (availableTypes.has('clean')) {
        imageTypes.push('clean');
        imageTypeLabels['clean'] = 'Cover/Clean';
    }
    
    if (availableTypes.has('stego')) {
        imageTypes.push('stego');
        imageTypeLabels['stego'] = 'Stego';
    }
    
    if (availableTypes.has('residual')) {
        imageTypes.push('residual');
        imageTypeLabels['residual'] = 'Residual';
    }

    imageTypes.forEach(imageType => {
        // 添加行标签
        const rowLabel = document.createElement('div');
        rowLabel.style.display = 'flex';
        rowLabel.style.alignItems = 'center';
        rowLabel.style.justifyContent = 'center';
        rowLabel.style.fontWeight = '600';
        rowLabel.style.color = '#34495e';
        rowLabel.style.backgroundColor = '#ecf0f1';
        rowLabel.style.borderRadius = '8px';
        rowLabel.style.padding = '10px';
        rowLabel.textContent = imageTypeLabels[imageType];
        comparisonTable.appendChild(rowLabel);

        // 添加每个模型的图像
        modelsWithStegoData.forEach(modelData => {
            const imageCell = document.createElement('div');
            imageCell.style.textAlign = 'center';
            imageCell.style.padding = '10px';
            imageCell.style.backgroundColor = '#f8f9fa';
            imageCell.style.borderRadius = '8px';
            
            const stegoData = modelData.visualcompare.stego;
            
            // 根据实际数据类型获取图像，更全面的查找
            let imageData = null;
            
            // 优先级查找顺序：cover > clean > 直接对应的imageType
            if (imageType === 'cover') {
                imageData = stegoData['cover'] || stegoData['clean'] || null;
            } else if (imageType === 'clean') {
                imageData = stegoData['clean'] || stegoData['cover'] || null;
            } else {
                imageData = stegoData[imageType] || null;
            }
            
            // 如果还是没有找到，尝试更多可能的键名
            if (!imageData) {
                const possibleKeys = ['cover', 'clean', 'Cover', 'Clean', 'COVER', 'CLEAN'];
                for (const key of possibleKeys) {
                    if (stegoData[key]) {
                        imageData = stegoData[key];
                        break;
                    }
                }
            }
            
            if (imageData) {
                const img = document.createElement('img');
                let src = imageData;
                if (!src.startsWith('data:image')) {
                    src = `data:image/png;base64,${src}`;
                }
                img.src = src;
                img.alt = `${imageType} image for ${modelData.modelname}`;
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '6px';
                img.style.cursor = 'pointer';
                img.style.transition = 'transform 0.2s ease';
                
                // 悬停放大效果
                img.addEventListener('mouseenter', () => {
                    img.style.transform = 'scale(1.05)';
                });
                
                img.addEventListener('mouseleave', () => {
                    img.style.transform = 'scale(1)';
                });
                
                // 点击放大查看
                img.addEventListener('click', () => {
                    showImageModal(src, `${modelData.modelname} - ${imageTypeLabels[imageType]}`, modelData, imageType);
                });
                
                imageCell.appendChild(img);
            } else {
                // 无图像数据
                const placeholder = document.createElement('div');
                placeholder.style.height = '200px'; // 增加高度
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.color = '#6c757d';
                placeholder.style.fontSize = '1rem'; // 增加字体大小
                placeholder.style.backgroundColor = '#e9ecef';
                placeholder.style.borderRadius = '6px';
                placeholder.textContent = 'No Image';
                imageCell.appendChild(placeholder);
            }
            
            comparisonTable.appendChild(imageCell);
        });
    });

    container.appendChild(comparisonTable);
}

/**
 * 显示图像模态框
 * @param {string} imageSrc - 图像源
 * @param {string} title - 标题
 * @param {Object} modelData - 模型数据（可选，用于IGWs显示prompt）
 * @param {string} imageType - 图像类型（可选）
 */
function showImageModal(imageSrc, title, modelData = null, imageType = null) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    modal.style.cursor = 'pointer';

    const modalContent = document.createElement('div');
    modalContent.style.maxWidth = '80%'; // 增加最大宽度以适应固定尺寸的图像
    modalContent.style.maxHeight = '90%'; // 增加最大高度
    modalContent.style.textAlign = 'center';
    modalContent.style.cursor = 'default';
    modalContent.style.display = 'flex';
    modalContent.style.flexDirection = 'column';
    modalContent.style.alignItems = 'center';
    modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    modalContent.style.borderRadius = '12px';
    modalContent.style.padding = '20px';
    modalContent.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';

    const modalTitle = document.createElement('h3');
    modalTitle.textContent = title;
    modalTitle.style.color = '#2c3e50'; // 改为深色以适应白色背景
    modalTitle.style.marginBottom = '20px';
    modalTitle.style.fontSize = '1.5rem';
    modalTitle.style.margin = '0 0 20px 0';

    const modalImg = document.createElement('img');
    modalImg.src = imageSrc;
    modalImg.style.maxWidth = '100%';
    modalImg.style.maxHeight = 'calc(70vh - 200px)';
    modalImg.style.borderRadius = '8px';
    modalImg.style.objectFit = 'contain';
    // 统一设置固定尺寸，确保所有图像放大后显示大小一致
    modalImg.style.width = '600px';  // 固定宽度
    modalImg.style.height = '600px'; // 固定高度
    modalImg.style.backgroundColor = '#f8f9fa'; // 添加背景色以显示图像边界
    
    // 响应式调整：在小屏幕上适当缩小
    if (window.innerWidth < 768) {
        modalImg.style.width = '90vw';
        modalImg.style.height = '90vw';
        modalImg.style.maxWidth = '400px';
        modalImg.style.maxHeight = '400px';
    }

    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalImg);

    // 检查是否是IGW模型，如果是则显示prompt
    const isIGW = modelData && (
        // 检查模型名称
        (modelData.modelname && (
            modelData.modelname.includes('IGW') || 
            modelData.modelname.includes('igw') ||
            modelData.modelname.toLowerCase().includes('igw')
        )) ||
        // 检查模型类型
        (modelData.modeltype && (
            modelData.modeltype.includes('In-Generation') ||
            modelData.modeltype.includes('IGW') ||
            modelData.modeltype.toLowerCase().includes('igw') ||
            modelData.modeltype.toLowerCase().includes('in-generation')
        ))
    );
    
    if (isIGW) {
        const stegoData = modelData.visualcompare && modelData.visualcompare.stego;
        
        if (stegoData) {
            // 尝试多种prompt键名
            const promptValue = stegoData.prompt || stegoData.Prompt || stegoData.PROMPT || stegoData.text || stegoData.description;
            
            if (promptValue) {
                const promptContainer = document.createElement('div');
                promptContainer.style.marginTop = '20px';
                promptContainer.style.padding = '15px';
                promptContainer.style.backgroundColor = 'rgba(52, 73, 94, 0.1)'; // 改为淡灰色背景
                promptContainer.style.borderRadius = '8px';
                promptContainer.style.maxWidth = '600px';
                promptContainer.style.margin = '20px auto 0';
                promptContainer.style.textAlign = 'left';
                promptContainer.style.border = '1px solid rgba(52, 73, 94, 0.2)';

                const promptLabel = document.createElement('div');
                promptLabel.textContent = 'Prompt:';
                promptLabel.style.color = '#2c3e50'; // 改为深色
                promptLabel.style.fontWeight = 'bold';
                promptLabel.style.fontSize = '1.1rem';
                promptLabel.style.marginBottom = '10px';

                const promptText = document.createElement('div');
                let promptContent = promptValue;
                
                // 处理不同类型的prompt数据
                if (typeof promptContent === 'object') {
                    promptContent = JSON.stringify(promptContent, null, 2);
                    promptText.style.fontFamily = 'monospace';
                    promptText.style.whiteSpace = 'pre-wrap';
                } else if (typeof promptContent !== 'string') {
                    promptContent = String(promptContent);
                }
                
                promptText.textContent = promptContent;
                promptText.style.color = '#2c3e50'; // 改为深色
                promptText.style.fontSize = '0.95rem';
                promptText.style.lineHeight = '1.4';
                promptText.style.wordWrap = 'break-word';
                promptText.style.maxHeight = '150px';
                promptText.style.overflow = 'auto';
                promptText.style.padding = '10px';
                promptText.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; // 改为白色背景
                promptText.style.borderRadius = '4px';
                promptText.style.border = '1px solid rgba(52, 73, 94, 0.1)';

                promptContainer.appendChild(promptLabel);
                promptContainer.appendChild(promptText);
                modalContent.appendChild(promptContainer);
            }
        }
    }

    modal.appendChild(modalContent);

    // 点击模态框背景关闭，但不包括内容区域
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });

    // 按ESC键关闭
    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleKeydown);
        }
    };
    document.addEventListener('keydown', handleKeydown);

    // 阻止模态框内容的点击事件冒泡
    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.body.appendChild(modal);
}

/**
 * 为所有图表添加重新渲染事件监听器
 * 解决图表初次加载时容器尺寸不正确的问题
 */
function addChartResizeListeners() {
    // 当窗口大小改变时重新渲染所有图表
    window.addEventListener('resize', function() {
        // 延迟执行，确保容器尺寸已更新
        setTimeout(() => {
            const containers = document.querySelectorAll('.chart-container');
            containers.forEach(container => {
                if (container.id && container._plotly) {
                    Plotly.Plots.resize(container.id);
                }
            });
        }, 100);
    });
    
    // 监听容器尺寸变化（使用ResizeObserver如果可用）
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const container = entry.target;
                if (container.id && container._plotly) {
                    setTimeout(() => {
                        Plotly.Plots.resize(container.id);
                    }, 50);
                }
            });
        });
        
        // 观察所有图表容器
        const containers = document.querySelectorAll('.chart-container');
        containers.forEach(container => {
            resizeObserver.observe(container);
        });
    }
}

// 导出函数到全局作用域
window.renderOverallRankingHero = renderOverallRankingHero;
window.renderRobustnessScoresGrid = renderRobustnessScoresGrid;
window.renderRobustnessCurvesGrid = renderRobustnessCurvesGrid;
window.renderAttackEffectivenessRanking = renderAttackEffectivenessRanking;
window.renderModelRobustnessCurves = renderModelRobustnessCurves;
window.renderDistortionVisualization = renderDistortionVisualization;
window.renderQualityMetricsCharts = renderQualityMetricsCharts;
window.renderStegoComparison = renderStegoComparison;
window.addChartResizeListeners = addChartResizeListeners;

// ===== 新增AUC计算和排名系统函数 =====

/**
 * 提取TPR-PSNR曲线数据
 * @param {Array} modelsData - 模型数据数组
 * @returns {Object} TPR-PSNR曲线数据
 */
function extractRobustnessCurveData(modelsData) {
    const curveData = {};
    
    modelsData.forEach(modelData => {
        const modelName = modelData.modelname;
        if (!modelData.robustnessresult) return;
        
        curveData[modelName] = {};
        
        for (const [noiseType, attackData] of Object.entries(modelData.robustnessresult)) {
            if (noiseType === 'No Attacking') continue;
            
            const points = [];
            
            if (attackData.factors) {
                for (const [factor, factorData] of Object.entries(attackData.factors)) {
                    // 获取TPR值
                    let tprValue = null;
                    for (const key of Object.keys(factorData)) {
                        if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                            const tprData = factorData[key];
                            if (Array.isArray(tprData)) {
                                tprValue = tprData.reduce((sum, val) => sum + parseFloat(val), 0) / tprData.length;
                            } else {
                                tprValue = parseFloat(tprData);
                            }
                            break;
                        }
                    }
                    
                    // 如果没有TPR，使用Extract Accuracy转换为0-1范围
                    if (tprValue === null && factorData['Extract Accuracy']) {
                        const accuracyData = factorData['Extract Accuracy'];
                        if (Array.isArray(accuracyData)) {
                            const avgAccuracy = accuracyData.reduce((sum, val) => sum + parseFloat(val), 0) / accuracyData.length;
                            tprValue = avgAccuracy / 100;
                        } else {
                            tprValue = parseFloat(accuracyData) / 100;
                        }
                    }
                    
                    // 获取PSNR值
                    let psnrValue = null;
                    if (factorData.visualquality && factorData.visualquality.PSNR) {
                        const psnrData = factorData.visualquality.PSNR;
                        if (Array.isArray(psnrData)) {
                            psnrValue = psnrData.reduce((sum, val) => sum + parseFloat(val), 0) / psnrData.length;
                        } else {
                            psnrValue = parseFloat(psnrData);
                        }
                    }
                    
                    if (tprValue !== null && psnrValue !== null && 
                        !isNaN(tprValue) && !isNaN(psnrValue) && 
                        isFinite(tprValue) && isFinite(psnrValue)) {
                        points.push([psnrValue, tprValue]);
                    }
                }
            }
            
            curveData[modelName][noiseType] = points;
        }
    });
    
    return curveData;
}

/**
 * 计算全局PSNR范围
 * @param {Array} modelsData - 模型数据数组
 * @returns {Object} 包含min和max的PSNR范围
 */
function determineGlobalPSNRRange(modelsData) {
    const psnrValues = [];
    const assumedNoAttackPSNR = 60.0;

    modelsData.forEach(modelData => {
        if (!modelData.robustnessresult) return;
        for (const [noiseType, attackData] of Object.entries(modelData.robustnessresult)) {
            if (attackData.factors) {
                for (const factorData of Object.values(attackData.factors)) {
                    if (factorData.visualquality && factorData.visualquality.PSNR) {
                        const psnrData = factorData.visualquality.PSNR;
                        if (Array.isArray(psnrData)) {
                            psnrData.forEach(val => {
                                const num = parseFloat(val);
                                if (!isNaN(num) && isFinite(num)) {
                                    psnrValues.push(num);
                                }
                            });
                        } else {
                            const num = parseFloat(psnrData);
                            if (!isNaN(num) && isFinite(num)) {
                                psnrValues.push(num);
                            }
                        }
                    }
                }
            }
        }
    });

    if (psnrValues.length === 0) {
        console.warn('No PSNR data found, using default range [20, 70]');
        return { min: 20.0, max: 70.0 };
    }

    // const actualMin = Math.min(...psnrValues);
    // const actualMax = Math.max(...psnrValues);

    // 使用循环查找最值，避免调用栈溢出
    let actualMin, actualMax;
    if (psnrValues.length > 0) {
        actualMin = psnrValues[0];
        actualMax = psnrValues[0];
        for (let i = 1; i < psnrValues.length; i++) {
            if (Number.isFinite(psnrValues[i])) {
                if (psnrValues[i] < actualMin) {
                    actualMin = psnrValues[i];
                }
                if (psnrValues[i] > actualMax) {
                    actualMax = psnrValues[i];
                }
            }
        }
    } else {
        // 处理 psnrValues 为空的情况，虽然下面有检查，但这里也做个兜底
        // 你可以根据需要调整这个默认范围
        console.warn('No PSNR data found, using default range [20, 70]');
        return { min: 20.0, max: 70.0 };
    }
    let globalMin, globalMax;
    if (actualMax < assumedNoAttackPSNR) {
        globalMax = assumedNoAttackPSNR;
        globalMin = actualMin;
    } else {
        globalMax = actualMax + 10.0;
        globalMin = actualMin;
    }

    return { min: globalMin, max: globalMax };
}

/**
 * 计算AUC分数，与Python实现保持一致
 * @param {Array} modelsData - 模型数据数组
 * @returns {Object} AUC分数
 */
function computeAUCScores(modelsData) {
    const curveData = extractRobustnessCurveData(modelsData);
    const psnrRange = determineGlobalPSNRRange(modelsData);
    const aucScores = {};

    if (psnrRange.max <= psnrRange.min) {
        console.error('Invalid PSNR range detected, using fallback [20, 70]');
        psnrRange.min = 20.0;
        psnrRange.max = 70.0;
    }
    
    for (const [modelName, noiseDict] of Object.entries(curveData)) {
        aucScores[modelName] = {};
        
        // 查找No Attacking的TPR值
        let tprNoAttack = null;
        const modelData = modelsData.find(m => m.modelname === modelName);
        if (modelData && modelData.robustnessresult && modelData.robustnessresult['No Attacking']) {
            const noAttackData = modelData.robustnessresult['No Attacking'];
            if (noAttackData.factors) {
                for (const factorData of Object.values(noAttackData.factors)) {
                    // 查找TPR@N%FPR
                    for (const key of Object.keys(factorData)) {
                        if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                            const tprData = factorData[key];
                            if (Array.isArray(tprData)) {
                                tprNoAttack = tprData.reduce((sum, val) => sum + parseFloat(val), 0) / tprData.length;
                            } else {
                                tprNoAttack = parseFloat(tprData);
                            }
                            break;
                        }
                    }
                    if (tprNoAttack !== null) break;
                    
                    if (tprNoAttack === null && factorData['Extract Accuracy']) {
                        const accuracyData = factorData['Extract Accuracy'];
                        if (Array.isArray(accuracyData)) {
                            const avgAccuracy = accuracyData.reduce((sum, val) => sum + parseFloat(val), 0) / accuracyData.length;
                            tprNoAttack = avgAccuracy / 100;
                        } else {
                            tprNoAttack = parseFloat(accuracyData) / 100;
                        }
                    }
                    if (tprNoAttack !== null) break;
                }
            }
        }
        
        for (const [noiseType, points] of Object.entries(noiseDict)) {
            const normalizedPoints = [];
            
            normalizedPoints.push([0.0, 0.0]);
            
            for (const [psnr, tpr] of points) {
                if (isFinite(psnr) && isFinite(tpr)) {
                    const psnrNorm = (psnr - psnrRange.min) / (psnrRange.max - psnrRange.min);
                    const clampedPsnrNorm = Math.max(0.0, Math.min(1.0, psnrNorm));
                    normalizedPoints.push([clampedPsnrNorm, tpr]);
                }
            }
            
            if (tprNoAttack !== null && isFinite(tprNoAttack)) {
                normalizedPoints.push([1.0, tprNoAttack]);
            }
            
            normalizedPoints.sort((a, b) => a[0] - b[0]);
            
            if (normalizedPoints.length >= 2) {
                let auc = 0.0;
                for (let i = 1; i < normalizedPoints.length; i++) {
                    const x1 = normalizedPoints[i-1][0];
                    const y1 = normalizedPoints[i-1][1];
                    const x2 = normalizedPoints[i][0];
                    const y2 = normalizedPoints[i][1];
                    
                    // 梯形面积
                    auc += (x2 - x1) * (y1 + y2) / 2.0;
                }
                aucScores[modelName][noiseType] = auc;
            } else {
                aucScores[modelName][noiseType] = NaN;
            }
        }
    }
    
    return aucScores;
}

/**
 * 计算基于排名的总分，与Python实现保持一致
 * @param {Object} aucScores - AUC分数
 * @returns {Object} 排名分数
 */
function computeRankingBasedScores(aucScores) {
    const modelNames = Object.keys(aucScores);
    const overallScores = {};
    
    modelNames.forEach(modelName => {
        overallScores[modelName] = 0;
    });
    
    const allNoiseTypes = new Set();
    for (const modelScores of Object.values(aucScores)) {
        for (const noiseType of Object.keys(modelScores)) {
            if (noiseType !== 'No Attacking') {
                allNoiseTypes.add(noiseType);
            }
        }
    }
    
    for (const noiseType of allNoiseTypes) {
        const modelsWithData = [];
        const scoresForNoise = [];
        
        for (const modelName of modelNames) {
            if (aucScores[modelName][noiseType] !== undefined && 
                isFinite(aucScores[modelName][noiseType])) {
                modelsWithData.push(modelName);
                scoresForNoise.push(aucScores[modelName][noiseType]);
            }
        }
        
        if (modelsWithData.length === 0) continue;
        
        // 按AUC分数排序（降序 - AUC越高排名越好）
        const sortedIndices = scoresForNoise
            .map((score, index) => ({ score, index }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.index);
        
        // 分配排名点数（第1名得N分，第2名得N-1分，等等）
        const numModels = modelsWithData.length;
        sortedIndices.forEach((originalIndex, rank) => {
            const modelName = modelsWithData[originalIndex];
            const points = numModels - rank; // 第1名得N分
            overallScores[modelName] += points;
        });
    }
    
    return overallScores;
}

/**
 * 计算攻击有效性，使用AE = (1 - TPR@N%FPR) × PSNR_normalized公式
 * @param {Array} modelsData - 模型数据数组
 * @returns {Object} 攻击有效性分数
 */
function computeAttackEffectiveness(modelsData) {
    const attackEffectiveness = {};
    const psnrRange = determineGlobalPSNRRange(modelsData);
    
    if (psnrRange.max <= psnrRange.min) {
        console.error('Invalid PSNR range for attack effectiveness calculation');
        return {};
    }
    
    modelsData.forEach(modelData => {
        if (!modelData.robustnessresult) return;
        
        for (const [attackType, attackData] of Object.entries(modelData.robustnessresult)) {
            if (attackType === 'No Attacking') continue;
            
            if (!attackEffectiveness[attackType]) {
                attackEffectiveness[attackType] = [];
            }
            
            if (attackData.factors) {
                for (const [factor, factorData] of Object.entries(attackData.factors)) {
                    // 获取TPR值
                    let tprValue = null;
                    for (const key of Object.keys(factorData)) {
                        if (key.startsWith('TPR@') && key.endsWith('%FPR')) {
                            const tprData = factorData[key];
                            if (Array.isArray(tprData)) {
                                tprValue = tprData.reduce((sum, val) => sum + parseFloat(val), 0) / tprData.length;
                            } else {
                                tprValue = parseFloat(tprData);
                            }
                            break;
                        }
                    }
                    
                    // 如果没有TPR，使用Extract Accuracy转换为0-1范围
                    if (tprValue === null && factorData['Extract Accuracy']) {
                        const accuracyData = factorData['Extract Accuracy'];
                        if (Array.isArray(accuracyData)) {
                            const avgAccuracy = accuracyData.reduce((sum, val) => sum + parseFloat(val), 0) / accuracyData.length;
                            tprValue = avgAccuracy / 100; // 转换为0-1范围
                        } else {
                            tprValue = parseFloat(accuracyData) / 100;
                        }
                    }
                    
                    // 获取PSNR值
                    let psnrValue = null;
                    if (factorData.visualquality && factorData.visualquality.PSNR) {
                        const psnrData = factorData.visualquality.PSNR;
                        if (Array.isArray(psnrData)) {
                            psnrValue = psnrData.reduce((sum, val) => sum + parseFloat(val), 0) / psnrData.length;
                        } else {
                            psnrValue = parseFloat(psnrData);
                        }
                    }
                    
                    if (tprValue !== null && psnrValue !== null && 
                        !isNaN(tprValue) && !isNaN(psnrValue) && 
                        isFinite(tprValue) && isFinite(psnrValue)) {
                        // 归一化PSNR，使用和Python一致的范围
                        const psnrNorm = (psnrValue - psnrRange.min) / (psnrRange.max - psnrRange.min);
                        const clampedPsnrNorm = Math.max(0.0, Math.min(1.0, psnrNorm));
                        
                        // 计算AE = (1 - TPR) × PSNR_norm
                        const clampedTpr = Math.max(0.0, Math.min(1.0, tprValue));
                        const ae = (1.0 - clampedTpr) * clampedPsnrNorm;
                        
                        attackEffectiveness[attackType].push(ae);
                    }
                }
            }
        }
    });
    
    return attackEffectiveness;
}