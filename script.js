/**
 * 2025 Political Compass Logic Script (Live Monitor Edition)
 */

let DB = null;
let currentCategoryIndex = 0;
let categories = [];
let availableQuestions = {}; 
let answeredCounts = {};
let scores = {};
let maxScores = {};
let topMatches = [];

// 历史记录栈
let historyStack = []; 
let currentQuestionData = null;

// ================= 初始化 =================

window.onload = async () => {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error("无法读取 data.json");
        DB = await res.json();
        
        const btn = document.getElementById('start-btn');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "开始测试 Mission Start!";
        }
        document.getElementById('loading-msg').style.display = 'none';
        
        initGame();
    } catch (e) {
        alert("错误：无法加载数据文件。\n请使用本地服务器运行。");
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
    updateLiveMonitor(); // 初始化监视器状态
}

function showScreen(id) {
    document.querySelectorAll('.card').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
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

    // ✨ 每次答题后更新实时监视器
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

    // ✨ 撤销后也要更新实时监视器
    updateLiveMonitor();
}

function updateUndoButtonState() {
    const btn = document.getElementById('btn-undo');
    if (btn) btn.disabled = (historyStack.length === 0);
}

// ================= ✨ 实时监视逻辑 (新功能) =================

function updateLiveMonitor() {
    const monitor = document.getElementById('live-monitor');
    const matchName = document.getElementById('live-match-name');

    // 1. 检查条件：每个维度至少回答了 1 题
    const isReady = categories.every(cat => answeredCounts[cat] > 0);

    if (isReady) {
        // 2. 计算当前最佳匹配
        const best = getBestMatch();
        if (best) {
            matchName.innerText = best.name;
            monitor.classList.remove('hidden');
        }
    } else {
        // 条件不满足时隐藏
        monitor.classList.add('hidden');
    }
}

// 提取出来的纯计算函数，返回排序后的匹配数组
function getSortedMatches() {
    let userStats = {};
    let totalPassion = 0;
    
    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis] === 0 ? 1 : maxScores[axis];
        let ratio = raw / max;
        userStats[axis] = ratio * 100;
        totalPassion += Math.abs(userStats[axis]);
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
            // 反中间派算法
            if (ideo.name.includes("中间派") && totalPassion > 150) {
                finalDist += 50;
            }
            matches.push({ ...ideo, dist: finalDist });
        }
    });

    matches.sort((a, b) => a.dist - b.dist);
    return { matches, userStats }; // 返回匹配列表和用户坐标
}

function getBestMatch() {
    const result = getSortedMatches();
    return result.matches.length > 0 ? result.matches[0] : null;
}

// ================= 结算逻辑 =================

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

function renderResults() {
    const { matches, userStats } = getSortedMatches();
    topMatches = matches.slice(0, 3);

    // 渲染维度条
    renderAxesCharts(userStats);

    // 渲染结果卡片
    if (topMatches.length > 0) renderBestMatchUI(topMatches[0]);
    if (topMatches.length > 1) renderSubMatchesUI(topMatches.slice(1, 3));
}

// ... (以下 UI 渲染函数与之前版本一致，只需改名以区分逻辑函数) ...

function renderBestMatchUI(data) {
    const container = document.getElementById('best-match-container');
    let matchPct = Math.max(0, 100 - (data.dist / 2.5)).toFixed(0);

    const formatTags = (items) => Array.isArray(items) ? items.map(i => `<span class="figure-tag">${i}</span>`).join('') : items;
    const formatList = (items) => Array.isArray(items) ? items.map(i => `<li>${i}</li>`).join('') : `<li>暂无推荐</li>`;
    let quoteHtml = data.quote ? `<div class="quote-box"><p class="quote-text">“${data.quote.text}”</p><p class="quote-author">—— ${data.quote.author}</p></div>` : '';

    container.innerHTML = `
        <div class="best-match-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h1 class="best-title" style="margin:0;">${data.name}</h1>
                <div style="text-align:right;">
                    <span style="font-size:1.8rem; color:var(--primary); font-weight:bold;">${matchPct}%</span>
                    <div style="font-size:0.8rem; color:#999;">契合度</div>
                </div>
            </div>
            <p class="best-desc">${data.desc}</p>
            <div class="best-info-grid">
                <div><h4>🗿 代表人物</h4><div class="tag-container">${formatTags(data.figures)}</div></div>
                <div><h4>📚 推荐书籍</h4><ul class="book-list">${formatList(data.books)}</ul></div>
            </div>
            ${quoteHtml}
        </div>
    `;
}

function renderSubMatchesUI(matches) {
    const container = document.getElementById('sub-matches-container');
    container.innerHTML = '';
    matches.forEach((m, idx) => {
        let realRank = idx + 2; 
        let matchPct = Math.max(0, 100 - (m.dist / 2.5)).toFixed(0);
        let icon = realRank === 2 ? '🥈' : '🥉';
        container.innerHTML += `
            <div class="sub-match-card" onclick="showDetail(${realRank - 1})">
                <div class="sub-left"><h4 style="margin:0;">${icon} ${m.name}</h4><small>点击查看详情</small></div>
                <div class="sub-right"><span class="sub-pct">${matchPct}%</span></div>
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

function showDetail(idx) {
    const data = topMatches[idx];
    if (!data) return;
    document.getElementById('modal-title').innerText = data.name;
    document.getElementById('modal-desc').innerText = data.desc;
    
    const figuresDiv = document.getElementById('modal-figures');
    if (Array.isArray(data.figures)) figuresDiv.innerHTML = data.figures.map(f => `<span class="figure-tag">${f}</span>`).join('');
    else figuresDiv.innerHTML = data.figures || "无数据";

    const quoteBox = document.getElementById('modal-quote');
    if(data.quote) quoteBox.innerHTML = `<p class="quote-text">“${data.quote.text}”</p><p class="quote-author">—— ${data.quote.author}</p>`;
    else quoteBox.innerHTML = "";

    const bookList = document.getElementById('modal-books');
    if (Array.isArray(data.books)) bookList.innerHTML = data.books.map(b => `<li>${b}</li>`).join('');
    else bookList.innerHTML = "<li>暂无推荐</li>";

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
}

window.onclick = function(e) {
    if(e.target == document.getElementById('detail-modal')) closeDetail();
}