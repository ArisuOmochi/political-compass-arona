/**
 * 2025 Political Compass Logic Script (Optimized V1.1)
 * 包含：基础逻辑、雷达图绘制、算法优化、社交分享
 */

let DB = null;
let currentCategoryIndex = 0;
let categories = [];
let availableQuestions = {}; 
let answeredCounts = {};
let scores = {};
let maxScores = {};
let topMatches = [];
let historyStack = []; 
let currentQuestionData = null;
let currentSelectedEffects = []; 
let specialQuestions = [];

window.onload = async () => {
    try {
        const res = await fetch('data.json?' + new Date().getTime());
        if (!res.ok) throw new Error("无法读取 data.json");
        DB = await res.json();
        
        const btnWrapper = document.getElementById('start-btn-wrapper');
        if(btnWrapper) {
            btnWrapper.style.pointerEvents = 'auto';
            btnWrapper.style.opacity = '1';
        }
        document.getElementById('loading-msg').style.display = 'none';
        initGame();
    } catch (e) {
        alert("错误：无法加载数据文件。\n请确保使用本地服务器运行 (localhost)。");
    }
};

// 初始化游戏状态
function initGame() {
    categories = DB.meta.question_logic.categories;
    historyStack = [];
    currentQuestionData = null;
    currentSelectedEffects = [];
    
    categories.forEach(cat => {
        if(DB.questions[cat]) {
            availableQuestions[cat] = [...DB.questions[cat]];
            availableQuestions[cat].sort(() => Math.random() - 0.5);
        } else {
            availableQuestions[cat] = [];
        }
        answeredCounts[cat] = 0;
    });

    if (DB.questions["comprehensive"]) {
        specialQuestions = [...DB.questions["comprehensive"]];
        specialQuestions.sort(() => Math.random() - 0.5);
    } else {
        specialQuestions = [];
    }
    answeredCounts['comprehensive'] = 0;

    for (let axis in DB.meta.axes) {
        scores[axis] = 0;
        maxScores[axis] = 0;
    }
    
    let realTotal = 0;
    categories.forEach(cat => { 
        if (DB.questions[cat]) realTotal += DB.questions[cat].length; 
    });
    realTotal += specialQuestions.length;
    
    const totalEl = document.getElementById('q-total');
    if(totalEl) totalEl.innerText = realTotal;

    const thresholdPerCat = DB.meta.question_logic.questions_per_category_before_skip; 
    const catCount = categories.length; 
    const standardRequired = thresholdPerCat * catCount; 
    const compRequired = Math.floor(standardRequired / 10); 
    const trueRequiredTotal = standardRequired + compRequired; 
    
    const marker = document.getElementById('early-marker');
    if (marker) {
        let markerPercent = (trueRequiredTotal / realTotal) * 100;
        markerPercent = Math.max(0, Math.min(100, markerPercent));
        marker.style.left = `${markerPercent}%`;
        marker.classList.remove('hidden');
        marker.dataset.threshold = trueRequiredTotal;
    }

    updateUndoButtonState();
    updateLiveMonitor();
}

function showScreen(id) {
    document.querySelectorAll('.card').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    const header = document.querySelector('header');
    if (header) {
        if (id === 'start-screen') header.classList.remove('hidden');
        else header.classList.add('hidden');
    }
    window.scrollTo(0, 0);
}

function startTest() { initGame(); showScreen('quiz-screen'); loadNextQuestion(); }

function openGallery() {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    container.innerHTML = ''; 

    DB.ideologies.forEach((ideo, index) => {
        let displayName = ideo.name.split(' (')[0];
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <div class="gallery-icon">${ideo.icon || '🏴'}</div>
            <div class="gallery-name">${displayName}</div>
        `;
        item.onclick = () => showDetail(index, 'gallery');
        container.appendChild(item);
    });

    showScreen('gallery-screen');
}

function backToStart() { showScreen('start-screen'); }

// 题目加载逻辑
function loadNextQuestion() {
    let standardAnsweredTotal = 0;
    categories.forEach(cat => { standardAnsweredTotal += answeredCounts[cat]; });
    
    let expectedCompCount = Math.floor(standardAnsweredTotal / 10);
    let currentCompCount = answeredCounts['comprehensive'];

    if (expectedCompCount > currentCompCount && specialQuestions.length > 0) {
        const question = specialQuestions.pop();
        currentQuestionData = { question, category: 'comprehensive', isMulti: true };
        renderQuestion(question, 'comprehensive');
        return;
    }

    const allDone = categories.every(cat => availableQuestions[cat].length === 0);
    if (allDone) { finishTest(); return; }

    let attempts = 0;
    let category = categories[currentCategoryIndex];
    while (availableQuestions[category].length === 0 && attempts < categories.length) {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        category = categories[currentCategoryIndex];
        attempts++;
    }
    if (attempts >= categories.length) { finishTest(); return; }

    const question = availableQuestions[category].pop();
    currentQuestionData = { question, category, isMulti: false };
    renderQuestion(question, category);
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
}

function renderQuestion(question, category) {
    const catMap = { "economy": "💰 经济", "diplomacy": "🌏 外交", "governance": "🏛️ 政治", "culture": "🎭 社会", "environment": "🌲 环境", "comprehensive": "🌟 综合决策 (多选)" };
    const catEl = document.getElementById('q-category');
    catEl.innerText = catMap[category] || category;
    catEl.className = `category-badge cat-${category === 'comprehensive' ? 'governance' : category}`;
    
    let text = question.text;
    if (category === 'comprehensive') text += "（多选题）";
    document.getElementById('question-text').innerText = text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    currentSelectedEffects = [];
    document.getElementById('btn-confirm').classList.add('hidden');

    question.options.forEach((opt) => {
        const btn = document.createElement('div');
        btn.className = 'option-card';
        btn.innerText = opt.text;
        if (category === 'comprehensive') {
            btn.onclick = () => toggleSelection(btn, opt.effects);
        } else {
            btn.onclick = () => handleAnswer(opt.effects, category);
        }
        container.appendChild(btn);
    });
    
    const skipBtn = document.getElementById('btn-skip');
    if (category === 'comprehensive') {
        skipBtn.classList.remove('hidden');
        skipBtn.disabled = false;
        skipBtn.innerText = "⏭️ 跳过此题";
    } else {
        skipBtn.classList.remove('hidden');
        updateSkipButtonState(category);
    }

    updateProgress();
    checkSkipCondition();
    updateUndoButtonState();
}

function updateSkipButtonState(category) {
    const skipBtn = document.getElementById('btn-skip');
    const threshold = DB.meta.question_logic.questions_per_category_before_skip; 
    const currentAnswered = answeredCounts[category];
    const remainingInPool = availableQuestions[category].length;
    const potentialTotal = currentAnswered + 1 + remainingInPool;
    
    if (potentialTotal <= threshold) {
        skipBtn.disabled = true;
        skipBtn.title = "本类别题目数量不足，无法跳过";
        skipBtn.innerText = "🚫 无法跳过";
    } else {
        skipBtn.disabled = false;
        skipBtn.title = "";
        skipBtn.innerText = "⏭️ 跳过此题";
    }
}

window.skipQuestion = function() {
    if (!currentQuestionData) return;
    historyStack.push({
        question: currentQuestionData.question,
        category: currentQuestionData.category,
        effects: null, 
        isMulti: (currentQuestionData.category === 'comprehensive'),
        actionType: 'skip'
    });
    loadNextQuestion();
}

function toggleSelection(btn, effects) {
    btn.classList.toggle('selected');
    if (btn.classList.contains('selected')) {
        currentSelectedEffects.push(effects);
    } else {
        currentSelectedEffects = currentSelectedEffects.filter(e => e !== effects);
    }
    const confirmBtn = document.getElementById('btn-confirm');
    if (currentSelectedEffects.length > 0) confirmBtn.classList.remove('hidden');
    else confirmBtn.classList.add('hidden');
}

window.submitMultiAnswer = function() {
    if (currentSelectedEffects.length === 0) return;
    let finalEffects = {};
    currentSelectedEffects.forEach(ef => {
        for (let axis in ef) {
            finalEffects[axis] = (finalEffects[axis] || 0) + ef[axis];
        }
    });
    document.getElementById('btn-confirm').classList.add('hidden');
    handleAnswer(finalEffects, 'comprehensive');
}

function handleAnswer(effects, category) {
    for (let axis in effects) {
        if (DB.meta.axes.hasOwnProperty(axis)) {
            scores[axis] += effects[axis];
            maxScores[axis] += Math.abs(effects[axis]);
        }
    }
    answeredCounts[category]++;
    if (currentQuestionData) {
        historyStack.push({
            question: currentQuestionData.question,
            category: currentQuestionData.category,
            effects: effects,
            isMulti: (category === 'comprehensive'),
            actionType: 'answer'
        });
    }
    updateLiveMonitor();
    setTimeout(() => { loadNextQuestion(); }, 100);
}

function prevQuestion() {
    if (historyStack.length === 0) return;
    const lastAction = historyStack.pop();
    
    if (lastAction.actionType === 'answer' || !lastAction.actionType) { 
        for (let axis in lastAction.effects) {
            scores[axis] -= lastAction.effects[axis];
            maxScores[axis] -= Math.abs(lastAction.effects[axis]);
        }
        answeredCounts[lastAction.category]--;
    }

    if (currentQuestionData) {
        if (currentQuestionData.category === 'comprehensive') specialQuestions.push(currentQuestionData.question);
        else availableQuestions[currentQuestionData.category].push(currentQuestionData.question);
    }

    currentQuestionData = { question: lastAction.question, category: lastAction.category };
    if (lastAction.category !== 'comprehensive') {
        const idx = categories.indexOf(lastAction.category);
        if(idx !== -1) currentCategoryIndex = (idx + 1) % categories.length;
    }

    renderQuestion(lastAction.question, lastAction.category);
    updateLiveMonitor();
}

function updateUndoButtonState() {
    const btn = document.getElementById('btn-undo');
    if(btn) btn.disabled = (historyStack.length === 0);
}

function checkSkipCondition() {
    const threshold = DB.meta.question_logic.questions_per_category_before_skip;
    const canSkip = categories.every(cat => answeredCounts[cat] >= threshold);
    const btn = document.getElementById('btn-finish-early');
    if (canSkip) btn.classList.remove('hidden'); else btn.classList.add('hidden');
}

function updateProgress() {
    let totalAnswered = Object.values(answeredCounts).reduce((a,b)=>a+b, 0);
    const totalEl = document.getElementById('q-total');
    const realTotal = totalEl ? parseInt(totalEl.innerText) : 100;
    const progEl = document.getElementById('q-progress');
    if(progEl) progEl.innerText = totalAnswered;
    const pct = Math.min(100, (totalAnswered / realTotal) * 100);
    document.getElementById('progress-bar').style.width = `${pct}%`;
    
    const marker = document.getElementById('early-marker');
    if (marker) {
        const trueThreshold = parseInt(marker.dataset.threshold) || 0;
        if (totalAnswered >= trueThreshold) {
            marker.style.opacity = '0.5'; marker.style.filter = 'grayscale(100%)';
        } else {
            marker.style.opacity = '1'; marker.style.filter = 'none';
        }
    }
}

function updateLiveMonitor() {
    const monitor = document.getElementById('live-monitor');
    const matchName = document.getElementById('live-match-name');
    const isReady = categories.length > 0 && categories.every(cat => answeredCounts[cat] > 0);

    if (isReady) {
        const best = getBestMatch();
        if (best) {
            const icon = best.icon ? best.icon + ' ' : '';
            matchName.innerText = icon + best.name.split(' (')[0];
            if(monitor) monitor.classList.remove('hidden');
        }
    } else {
        if(monitor) monitor.classList.add('hidden');
    }
}

// 优化 3：算法修正（平滑中间派判定和极值处理）
function getSortedMatches() {
    let userStats = {};
    let isCentristEligible = true;
    const VETO_THRESHOLD = 35; // 稍微放宽中间派阈值
    
    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis] === 0 ? 1 : maxScores[axis];
        
        // 修正：确保分母足够大，防止只答1题导致数值达到100%极端值
        if (max < 10) max = 10; 

        let val = (raw / max) * 100;
        userStats[axis] = val;
        
        // 如果任何维度倾向过高，则不适合判定为纯中间派
        if (Math.abs(val) > VETO_THRESHOLD) isCentristEligible = false;
    }

    let matches = [];
    DB.ideologies.forEach(ideo => {
        let dist = 0;
        let count = 0;
        for (let axis in ideo.stats) {
            if (userStats[axis] !== undefined) {
                let diff = userStats[axis] - ideo.stats[axis];
                dist += Math.pow(diff, 2);
                count++;
            }
        }
        
        if (count > 0) {
            let finalDist = Math.sqrt(dist);
            // 惩罚机制：如果意识形态是“中间派”但用户不符合资格，增加距离惩罚
            // 以前是直接加10000，现在加50，让它在列表中沉底但依然可见
            if (ideo.name.includes("中间派") && !isCentristEligible) {
                finalDist += 50; 
            }
            matches.push({ ...ideo, dist: finalDist });
        }
    });
    matches.sort((a, b) => a.dist - b.dist);
    return { matches, userStats };
}

function getBestMatch() {
    const result = getSortedMatches();
    return result.matches.length > 0 ? result.matches[0] : null;
}

function finishTest() {
    showScreen('result-screen');
    renderResults();
}

function renderResults() {
    const { matches, userStats } = getSortedMatches();
    topMatches = matches.slice(0, 3);
    
    // 渲染条形图
    renderAxesCharts(userStats);
    
    // 优化 1：渲染雷达图
    const radarContainer = document.getElementById('radar-chart-area');
    if (radarContainer) {
        renderRadarChart(userStats, 'radar-chart-area');
    }

    const container = document.getElementById('top-matches-container');
    if (!container) return;
    container.innerHTML = '';

    topMatches.forEach((m, idx) => {
        let matchPct = Math.max(0, 100 - (m.dist / 2.5)).toFixed(0);
        let rankClass = idx === 0 ? 'rank-gold' : (idx === 1 ? 'rank-silver' : 'rank-bronze');
        let icon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        let ideoIcon = m.icon ? m.icon : '';
        let displayName = m.name;
        let subName = "";
        if (m.name.includes('(')) {
            const parts = m.name.split(' (');
            displayName = parts[0];
            subName = parts[1].replace(')', '');
        }

        container.innerHTML += `
            <div class="match-card ${rankClass}" onclick="showDetail(${idx}, 'result')">
                <div class="match-left">
                    <span class="rank-icon">${icon}</span>
                    <div class="match-info">
                        <h3 class="list-title">
                            <span class="ideo-icon">${ideoIcon}</span>
                            ${displayName}
                        </h3>
                        ${subName ? `<div class="name-en">${subName}</div>` : ''}
                    </div>
                </div>
                <div class="match-right">
                    <span class="match-pct">${matchPct}%</span>
                </div>
            </div>
        `;
    });
}

/**
 * 优化 1：绘制 SVG 雷达图
 * @param {Object} userStats - 用户各维度得分 (-100 到 100)
 * @param {String} containerId - 容器 ID
 */
function renderRadarChart(userStats, containerId) {
    const axesOrder = ['econ', 'dipl', 'govt', 'scty', 'env'];
    // 定义每个维度的标签（取正向/右侧含义，代表该维度的扩张方向）
    const labels = {
        'econ': '经济自由',
        'dipl': '民族主权', 
        'govt': '政治权威',
        'scty': '社会传统',
        'env':  '工业优先' 
    };
    
    const size = 300;
    const center = size / 2;
    const radius = 100;
    const sides = 5;
    
    let points = [];
    
    axesOrder.forEach((axis, i) => {
        // 将 -100~100 映射到 0~1 之间 
        // 中心(0)代表极端左/反向，外圈(1)代表极端右/正向
        // 这样形成的"形状"能直观反映倾向
        let val = userStats[axis];
        let normalized = (val + 100) / 200; 
        
        // 视觉微调：保证即使是-100也不会完全缩成一个点看不见，加一点基底
        normalized = 0.1 + (normalized * 0.9);
        
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const r = normalized * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        points.push(`${x},${y}`);
    });

    // 计算背景五边形 (外圈)
    let bgPoints = [];
    for(let i=0; i<sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        bgPoints.push(`${x},${y}`);
    }

    // 计算中圈虚线 (50% 线)
    let midPoints = [];
    for(let i=0; i<sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = center + (radius * 0.5) * Math.cos(angle);
        const y = center + (radius * 0.5) * Math.sin(angle);
        midPoints.push(`${x},${y}`);
    }
    
    // 计算标签坐标
    let labelTags = '';
    axesOrder.forEach((axis, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const labelR = radius + 25;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);
        
        // 动态调整文字对齐，防止遮挡
        let anchor = 'middle';
        if (x < center - 10) anchor = 'end';
        if (x > center + 10) anchor = 'start';
        
        labelTags += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label">${labels[axis]}</text>`;
    });

    const svg = `
    <svg viewBox="0 0 ${size} ${size}" class="radar-chart">
        <!-- 网格 -->
        <polygon points="${bgPoints.join(' ')}" class="radar-bg" />
        <polygon points="${midPoints.join(' ')}" class="radar-grid" />
        
        <!-- 中心辅助线 -->
        <line x1="${center}" y1="${center-3}" x2="${center}" y2="${center+3}" stroke="#ccc" />
        <line x1="${center-3}" y1="${center}" x2="${center+3}" y2="${center}" stroke="#ccc" />

        <!-- 数据区域 -->
        <polygon points="${points.join(' ')}" class="radar-area" />
        
        <!-- 数据点 -->
        ${points.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" class="radar-point" />`).join('')}
        
        <!-- 标签 -->
        ${labelTags}
    </svg>
    `;
    
    document.getElementById(containerId).innerHTML = svg;
}

function renderAxesCharts(userStats) {
    const container = document.getElementById('axes-results');
    container.innerHTML = '';
    for(let axis in DB.meta.axes) {
        const meta = DB.meta.axes[axis];
        const val = userStats[axis];
        const pctRight = (val + 100) / 2;
        const pctLeft = 100 - pctRight;
        
        container.innerHTML += `
            <div class="axis-row">
                <div class="axis-header">
                    <span>${meta.left} <span class="pct-val">${pctLeft.toFixed(1)}%</span></span>
                    <span class="axis-name">${meta.name}</span>
                    <span><span class="pct-val">${pctRight.toFixed(1)}%</span> ${meta.right}</span>
                </div>
                <div class="axis-bar-bg">
                    <div class="axis-bar-left" style="width: ${pctLeft}%"></div>
                    <div class="axis-bar-right" style="width: ${pctRight}%"></div>
                    <div class="axis-marker" style="left: ${pctLeft}%"></div>
                </div>
            </div>
        `;
    }
}

// 优化 2：复制结果到剪贴板功能
function copyResultToClipboard() {
    if (!topMatches || topMatches.length === 0) return;
    
    const best = topMatches[0];
    const bestPct = Math.max(0, 100 - (best.dist / 2.5)).toFixed(0);
    const date = new Date().toLocaleDateString();
    
    // 构建战报文本
    let text = `🗳️ 2025 政治光谱测试 (最终版)\n`;
    text += `📅 时间: ${date}\n\n`;
    text += `✨ 我的最终判定: 【${best.name.split(' (')[0]}】\n`;
    text += `📊 契合度: ${bestPct}%\n`;
    if (best.quote) {
        text += `💬 "${best.quote.origin || best.quote.trans}"\n\n`;
    }
    
    if (topMatches[1]) text += `🥈 第二顺位: ${topMatches[1].name.split(' (')[0]}\n`;
    if (topMatches[2]) text += `🥉 第三顺位: ${topMatches[2].name.split(' (')[0]}\n`;
    
    // 如果你有部署的URL，可以加在最后
    // text += `\n👉 快来测测你的成分: https://your-site-url.com`;

    navigator.clipboard.writeText(text).then(() => {
        alert("✅ 结果已复制到剪贴板！\n快去粘贴分享给朋友吧！");
    }).catch(err => {
        console.error('复制失败', err);
        alert("复制失败，请手动截图分享。");
    });
}

function showDetail(identifier, mode) {
    let data = null;
    if (mode === 'result') data = topMatches[identifier];
    else data = DB.ideologies[identifier];
    
    if (!data) return;
    
    const iconHtml = data.icon ? data.icon + ' ' : '';
    let displayName = data.name.split(' (')[0];
    document.getElementById('modal-title').innerText = iconHtml + displayName;
    document.getElementById('modal-desc').innerText = data.desc;
    
    const statsContainer = document.getElementById('modal-stats-bar');
    statsContainer.innerHTML = '';
    
    for(let axis in DB.meta.axes) {
        const meta = DB.meta.axes[axis];
        let val = data.stats[axis] || 0; 
        
        let color = val >= 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
        let width = Math.abs(val) / 2; 
        let leftPos = val >= 0 ? '50%' : `${50 - width}%`;
        let pctText = Math.abs(val) + '%';
        
        let textStyle = val >= 0 
            ? `left: calc(50% + ${width}% + 5px); color: ${color};` 
            : `right: calc(50% + ${width}% + 5px); color: ${color};`;
            
        if (Math.abs(val) < 10) {
            textStyle = `left: 50%; transform: translateX(-50%); color: #999; top: -18px;`;
        }

        statsContainer.innerHTML += `
            <div class="mini-stat-row">
                <div class="mini-label left">${meta.left}</div>
                
                <div class="mini-bar-container">
                    <div style="position:absolute; left:50%; top:0; bottom:0; width:2px; background:#fff; z-index:2;"></div>
                    <div class="mini-bar-fill" style="left: ${leftPos}; width: ${width}%; background: ${color};"></div>
                    <span class="mini-bar-text" style="${textStyle}">${pctText}</span>
                </div>
                
                <div class="mini-label right">${meta.right}</div>
            </div>
        `;
    }

    const formatTags = (items) => Array.isArray(items) ? items.map(i => `<span class="figure-tag">${i}</span>`).join('') : items;
    document.getElementById('modal-figures').innerHTML = formatTags(data.figures);

    const quoteBox = document.getElementById('modal-quote');
    if(data.quote) {
        quoteBox.innerHTML = `
            <p style="font-weight:bold; font-style:italic; margin-bottom:5px;">${data.quote.origin || data.quote.text}</p>
            <p style="font-size:0.9em; color:#666; margin-bottom:5px;">${data.quote.trans || ''}</p>
            <p style="text-align:right; font-weight:bold;">${data.quote.source || data.quote.author}</p>
        `;
    } else {
        quoteBox.innerHTML = "";
    }

    const bookList = document.getElementById('modal-books');
    if (Array.isArray(data.books)) bookList.innerHTML = data.books.map(b => `<li>${b}</li>`).join('');
    else bookList.innerHTML = "<li>暂无推荐</li>";

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetail() { document.getElementById('detail-modal').classList.add('hidden'); }
window.onclick = function(e) { if(e.target == document.getElementById('detail-modal')) closeDetail(); }

/**
 * 高级功能：生成长截图并分享 (修复版：去除灰蒙蒙滤镜)
 * 依赖库：html2canvas
 */
function captureAndShare() {
    const target = document.getElementById('result-screen');
    const btn = document.getElementById('btn-share-img');
    const originalText = btn.innerText;

    // 1. 状态反馈
    btn.innerText = "⏳ 正在绘图...";
    btn.disabled = true;

    // 2. 隐藏按钮区 (为了截图好看)
    const actionsDiv = document.querySelector('.result-actions');
    actionsDiv.style.display = 'none';
    
    // 添加水印
    const watermark = document.createElement('div');
    watermark.innerHTML = "<p style='font-size:12px; opacity:0.6;'>—— 2025 政治光谱测试 ——</p>";
    watermark.style.textAlign = 'center';
    watermark.style.color = '#999';
    watermark.style.marginTop = '20px';
    watermark.style.paddingBottom = '20px'; // 底部留白
    target.appendChild(watermark);

    // 3. 核心截图逻辑
    html2canvas(target, {
        useCORS: true,
        scale: 2, // 保持高清
        backgroundColor: '#ffffff', // 强制背景白
        logging: false,
        // 【关键修复】在克隆的节点上清理样式
        onclone: (clonedDoc) => {
            const clonedTarget = clonedDoc.getElementById('result-screen');
            
            // 修复1: 强制移除阴影 (阴影是造成灰蒙蒙的最大元凶)
            clonedTarget.style.boxShadow = 'none';
            
            // 修复2: 移除动画和变换，防止透明度异常
            clonedTarget.style.animation = 'none';
            clonedTarget.style.transform = 'none';
            clonedTarget.style.transition = 'none';
            
            // 修复3: 强制文字颜色为深色 (防止CSS变量在某些浏览器下失效变淡)
            clonedTarget.style.color = '#2c3e50';
            
            // 修复4: 强制背景不透明
            clonedTarget.style.background = '#ffffff';
            
            // 针对雷达图的文字进行加深
            const radarLabels = clonedTarget.querySelectorAll('.radar-label');
            radarLabels.forEach(el => el.style.fill = '#333333');
            
            // 针对坐标轴文字加深
            const axisText = clonedTarget.querySelectorAll('.axis-header');
            axisText.forEach(el => el.style.color = '#000000');
        }
    }).then(canvas => {
        // 4. 恢复现场
        actionsDiv.style.display = 'block';
        if(target.contains(watermark)) target.removeChild(watermark);
        btn.innerText = originalText;
        btn.disabled = false;

        // 5. 导出逻辑
        canvas.toBlob(async (blob) => {
            try {
                // 尝试写入剪贴板 (仅HTTPS或Localhost有效)
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                alert("✅ 长截图已生成并复制！\n\n可以直接去微信粘贴 (Ctrl+V) 发送了。");
            } catch (err) {
                // 失败则自动下载
                console.warn("剪贴板写入受限，转为下载:", err);
                downloadImage(canvas);
            }
        }, 'image/png');
    }).catch(err => {
        console.error("截图失败:", err);
        alert("生成图片出错，请尝试手动截屏。");
        actionsDiv.style.display = 'block';
        if(target.contains(watermark)) target.removeChild(watermark);
        btn.innerText = originalText;
        btn.disabled = false;
    });
}

function downloadImage(canvas) {
    const link = document.createElement('a');
    link.download = `政治光谱测试_${new Date().getTime()}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert("📸 图片已保存到相册/下载文件夹！");
}

// 辅助函数：下载图片（作为剪贴板失败的备选方案）
function downloadImage(canvas) {
    const link = document.createElement('a');
    link.download = `政治光谱测试结果_${new Date().getTime()}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert("⚠️ 由于浏览器限制，图片已自动为您下载！");
}