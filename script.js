/**
 * 2025 Political Compass Logic Script (Optimized V1.2)
 * 更新：分享按钮置顶、长按图片保存、点击提示
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

function getSortedMatches() {
    let userStats = {};
    let isCentristEligible = true;
    const VETO_THRESHOLD = 35; 
    
    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis] === 0 ? 1 : maxScores[axis];
        if (max < 10) max = 10; 

        let val = (raw / max) * 100;
        userStats[axis] = val;
        
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
    
    renderAxesCharts(userStats);
    
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
 * 功能：生成长截图并弹出图片供长按保存
 * 修改点：移除了复制到剪贴板，一律使用弹窗展示图片
 */
function captureAndShare() {
    const target = document.getElementById('result-screen');
    const btn = document.getElementById('btn-share-img');
    const originalText = btn.innerText;

    // 1. 状态反馈
    btn.innerText = "⏳ 绘图中...";
    btn.disabled = true;
    
    // 暂时隐藏分享按钮本身，以免截进去
    btn.style.opacity = '0';

    // 2. 隐藏底部的操作按钮区 (为了截图好看)
    const actionsDiv = document.querySelector('.result-actions');
    actionsDiv.style.display = 'none';
    
    // 添加水印
    const watermark = document.createElement('div');
    watermark.innerHTML = "<p style='font-size:12px; opacity:0.6; padding-top:10px;'>—— 2025 政治光谱测试 ——</p>";
    watermark.style.textAlign = 'center';
    watermark.style.color = '#999';
    watermark.style.marginTop = '20px';
    watermark.style.paddingBottom = '30px'; 
    target.appendChild(watermark);

    // 3. 生成截图
    html2canvas(target, {
        useCORS: true,
        scale: 2, 
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
            const clonedTarget = clonedDoc.getElementById('result-screen');
            clonedTarget.style.boxShadow = 'none';
            clonedTarget.style.animation = 'none';
            clonedTarget.style.transform = 'none';
            clonedTarget.style.color = '#2c3e50';
            clonedTarget.style.background = '#ffffff';
            
            // 修复雷达图文字颜色
            const radarLabels = clonedTarget.querySelectorAll('.radar-label');
            radarLabels.forEach(el => el.style.fill = '#333333');
            const axisText = clonedTarget.querySelectorAll('.axis-header');
            axisText.forEach(el => el.style.color = '#000000');
        }
    }).then(canvas => {
        // 4. 恢复现场
        actionsDiv.style.display = 'block';
        btn.style.opacity = '1';
        if(target.contains(watermark)) target.removeChild(watermark);
        btn.innerText = originalText;
        btn.disabled = false;

        // 5. 直接弹出图片层
        showResultImage(canvas.toDataURL("image/png"));

    }).catch(err => {
        console.error("截图失败:", err);
        alert("生成图片出错，请检查网络或浏览器版本。");
        actionsDiv.style.display = 'block';
        btn.style.opacity = '1';
        if(target.contains(watermark)) target.removeChild(watermark);
        btn.innerText = originalText;
        btn.disabled = false;
    });
}

/**
 * 展示图片弹窗
 */
function showResultImage(dataUrl) {
    // 创建遮罩层
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    
    // 内容结构
    modal.innerHTML = `
        <div class="share-modal-content">
            <img src="${dataUrl}" class="share-img" alt="结果长图">
        </div>
        <div class="share-tips">👆 长按上方图片保存，然后分享到QQ群/微信</div>
        <button class="close-share" onclick="closeShareModal(this)">关闭</button>
    `;
    
    document.body.appendChild(modal);
}

function closeShareModal(btn) {
    const modal = btn.parentElement;
    document.body.removeChild(modal);
}

function renderRadarChart(userStats, containerId) {
    const axesOrder = ['econ', 'dipl', 'govt', 'scty', 'env'];
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
        let val = userStats[axis];
        let normalized = (val + 100) / 200; 
        normalized = 0.1 + (normalized * 0.9);
        
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const r = normalized * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        points.push(`${x},${y}`);
    });

    let bgPoints = [];
    for(let i=0; i<sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        bgPoints.push(`${x},${y}`);
    }

    let midPoints = [];
    for(let i=0; i<sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = center + (radius * 0.5) * Math.cos(angle);
        const y = center + (radius * 0.5) * Math.sin(angle);
        midPoints.push(`${x},${y}`);
    }
    
    let labelTags = '';
    axesOrder.forEach((axis, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const labelR = radius + 25;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);
        
        let anchor = 'middle';
        if (x < center - 10) anchor = 'end';
        if (x > center + 10) anchor = 'start';
        
        labelTags += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label">${labels[axis]}</text>`;
    });

    const svg = `
    <svg viewBox="0 0 ${size} ${size}" class="radar-chart">
        <polygon points="${bgPoints.join(' ')}" class="radar-bg" />
        <polygon points="${midPoints.join(' ')}" class="radar-grid" />
        <line x1="${center}" y1="${center-3}" x2="${center}" y2="${center+3}" stroke="#ccc" />
        <line x1="${center-3}" y1="${center}" x2="${center+3}" y2="${center}" stroke="#ccc" />
        <polygon points="${points.join(' ')}" class="radar-area" />
        ${points.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" class="radar-point" />`).join('')}
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