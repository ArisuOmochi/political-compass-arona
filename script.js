/**
 * 2025 Political Compass Logic Script (List View Fix)
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

// ================= 初始化 =================

window.onload = async () => {
    try {
        // 加载防缓存：添加时间戳参数
        const res = await fetch('data.json?' + new Date().getTime());
        if (!res.ok) throw new Error("无法读取 data.json");
        DB = await res.json();
        
        const btn = document.getElementById('start-btn');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "开始测试 Mission Start!";
        }
        const loadingMsg = document.getElementById('loading-msg');
        if(loadingMsg) loadingMsg.style.display = 'none';
        
        initGame();
    } catch (e) {
        console.error(e);
        alert("错误：数据加载失败。\n请检查本地服务器或 data.json 格式。");
    }
};

function initGame() {
    categories = DB.meta.question_logic.categories;
    historyStack = [];
    currentQuestionData = null;
    
    categories.forEach(cat => {
        if(DB.questions[cat]) {
            availableQuestions[cat] = [...DB.questions[cat]];
            availableQuestions[cat].sort(() => Math.random() - 0.5);
        } else {
            availableQuestions[cat] = [];
        }
        answeredCounts[cat] = 0;
    });
    
    for (let axis in DB.meta.axes) {
        scores[axis] = 0;
        maxScores[axis] = 0;
    }
    
    updateUndoButtonState();
    updateLiveMonitor();
}

function showScreen(id) {
    // 1. 隐藏所有卡片页面
    document.querySelectorAll('.card').forEach(el => el.classList.add('hidden'));
    
    // 2. 显示目标页面
    document.getElementById(id).classList.remove('hidden');
    
    // 3. ✨ 核心修改：控制头部(Header)的显示与隐藏
    const header = document.querySelector('header');
    if (header) {
        if (id === 'start-screen') {
            header.classList.remove('hidden'); // 在开始页显示
        } else {
            header.classList.add('hidden');    // 在答题页和结果页隐藏
        }
    }
    
    // 4. 滚回到顶部
    window.scrollTo(0, 0);
}

function startTest() {
    initGame();
    showScreen('quiz-screen');
    loadNextQuestion();
}

// ================= 答题逻辑 =================

function loadNextQuestion() {
    const allDone = categories.every(cat => availableQuestions[cat].length === 0);
    if (allDone) {
        finishTest();
        return;
    }

    let attempts = 0;
    let category = categories[currentCategoryIndex];
    
    while (availableQuestions[category].length === 0 && attempts < categories.length) {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        category = categories[currentCategoryIndex];
        attempts++;
    }

    if (attempts >= categories.length || availableQuestions[category].length === 0) {
        finishTest();
        return;
    }

    const question = availableQuestions[category].pop();
    currentQuestionData = { question, category };
    renderQuestion(question, category);
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
}

function renderQuestion(question, category) {
    const catMap = {
        "economy": "💰 经济", "diplomacy": "🌏 外交", 
        "governance": "🏛️ 政治", "culture": "🎭 社会", 
        "environment": "🌲 环境"
    };
    
    const catEl = document.getElementById('q-category');
    catEl.innerText = catMap[category] || category;
    catEl.className = `category-badge cat-${category}`;
    
    document.getElementById('question-text').innerText = question.text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    question.options.forEach((opt) => {
        const btn = document.createElement('div');
        btn.className = 'option-card';
        btn.innerText = opt.text;
        btn.onclick = () => handleAnswer(opt.effects, category);
        container.appendChild(btn);
    });
    
    updateProgress();
    checkSkipCondition();
    updateUndoButtonState();
}

function handleAnswer(effects, category) {
    for (let axis in effects) {
        if (DB.meta.axes.hasOwnProperty(axis)) {
            const val = effects[axis];
            scores[axis] += val;
            maxScores[axis] += Math.abs(val);
        }
    }
    
    answeredCounts[category]++;
    
    if (currentQuestionData) {
        historyStack.push({
            question: currentQuestionData.question,
            category: currentQuestionData.category,
            effects: effects
        });
    }

    updateLiveMonitor();

    setTimeout(() => {
        loadNextQuestion();
    }, 100);
}

function prevQuestion() {
    if (historyStack.length === 0) return;

    const lastAction = historyStack.pop();

    for (let axis in lastAction.effects) {
        if (DB.meta.axes.hasOwnProperty(axis)) {
            const val = lastAction.effects[axis];
            scores[axis] -= val;
            maxScores[axis] -= Math.abs(val);
        }
    }
    answeredCounts[lastAction.category]--;

    if (currentQuestionData) {
        availableQuestions[currentQuestionData.category].push(currentQuestionData.question);
    }

    currentQuestionData = {
        question: lastAction.question,
        category: lastAction.category
    };

    renderQuestion(lastAction.question, lastAction.category);
    
    const idx = categories.indexOf(lastAction.category);
    if(idx !== -1) {
        currentCategoryIndex = (idx + 1) % categories.length;
    }

    updateLiveMonitor();
}

function updateUndoButtonState() {
    const btn = document.getElementById('btn-undo');
    if (btn) btn.disabled = (historyStack.length === 0);
}

// ================= 计算逻辑 =================

function updateLiveMonitor() {
    const monitor = document.getElementById('live-monitor');
    const matchName = document.getElementById('live-match-name');

    const totalAnswered = Object.values(answeredCounts).reduce((a,b)=>a+b, 0);

    if (totalAnswered > 0) {
        const best = getBestMatch();
        if (best) {
            const icon = best.icon ? best.icon + ' ' : '';
            matchName.innerText = icon + best.name;
            if(monitor) monitor.classList.remove('hidden');
        }
    } else {
        if(monitor) monitor.classList.add('hidden');
    }
}

function getSortedMatches() {
    let userStats = {};
    let isCentristEligible = true;
    const VETO_THRESHOLD = 30; 

    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis] === 0 ? 1 : maxScores[axis];
        let ratio = raw / max;
        let val = ratio * 100;
        userStats[axis] = val;
        
        if (Math.abs(val) > VETO_THRESHOLD) {
            isCentristEligible = false;
        }
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
                finalDist += 10000; 
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

// ================= 结算渲染 (关键修复) =================

function checkSkipCondition() {
    const threshold = DB.meta.question_logic.questions_per_category_before_skip;
    const canSkip = categories.every(cat => answeredCounts[cat] >= threshold);
    const btn = document.getElementById('btn-finish-early');
    if (canSkip) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function updateProgress() {
    const totalAnswered = Object.values(answeredCounts).reduce((a,b)=>a+b, 0);
    const estimatedTotal = 50; 
    document.getElementById('q-progress').innerText = totalAnswered;
    const pct = Math.min(100, (totalAnswered / estimatedTotal) * 100);
    document.getElementById('progress-bar').style.width = `${pct}%`;
}

function finishTest() {
    showScreen('result-screen');
    renderResults();
}

// 核心渲染函数：修复了ID不匹配问题
function renderResults() {
    const { matches, userStats } = getSortedMatches();
    topMatches = matches.slice(0, 3);

    // 1. 渲染维度条 (这部分在截图中是正常的)
    renderAxesCharts(userStats);

    // 2. 渲染匹配列表 (这部分在截图中是空的)
    const container = document.getElementById('top-matches-container');
    
    // 安全检查：如果HTML里没有这个ID，说明HTML文件没更新
    if (!container) {
        alert("错误：页面结构不匹配。请刷新页面或清除缓存。");
        return;
    }
    
    container.innerHTML = '';

    topMatches.forEach((m, idx) => {
        let matchPct = Math.max(0, 100 - (m.dist / 2.5)).toFixed(0);
        let rankClass = idx === 0 ? 'rank-gold' : (idx === 1 ? 'rank-silver' : 'rank-bronze');
        let icon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        let ideoIcon = m.icon ? m.icon : ''; // 阵营emoji

        container.innerHTML += `
            <div class="match-card ${rankClass}" onclick="showDetail(${idx})">
                <div class="match-left">
                    <span class="rank-icon">${icon}</span>
                    <div class="match-info">
                        <h3><span class="ideo-icon">${ideoIcon}</span> ${m.name}</h3>
                        <small>点击查看详情</small>
                    </div>
                </div>
                <div class="match-right">
                    <span class="match-pct">${matchPct}%</span>
                    <span class="match-label">契合度</span>
                </div>
            </div>
        `;
    });
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

// 弹窗逻辑
function showDetail(idx) {
    const data = topMatches[idx];
    if (!data) return;
    
    const iconHtml = data.icon ? data.icon + ' ' : '';
    document.getElementById('modal-title').innerText = iconHtml + data.name;
    document.getElementById('modal-desc').innerText = data.desc;
    
    // 处理数组转标签
    const formatTags = (items) => Array.isArray(items) ? items.map(i => `<span class="figure-tag">${i}</span>`).join('') : items;
    document.getElementById('modal-figures').innerHTML = formatTags(data.figures);

    // 处理名言
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

    // 处理书籍
    const bookList = document.getElementById('modal-books');
    if (Array.isArray(data.books)) {
        bookList.innerHTML = data.books.map(b => `<li>${b}</li>`).join('');
    } else {
        bookList.innerHTML = "<li>暂无推荐</li>";
    }

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
}

window.onclick = function(e) {
    if(e.target == document.getElementById('detail-modal')) closeDetail();
}