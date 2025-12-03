/**
 * 2025 Political Compass Logic Script
 * Features: 
 * - Round-robin question distribution
 * - Multi-dimensional scoring
 * - "Anti-Centrist" bias algorithm
 * - Detailed result rendering
 */

let DB = null;
let currentCategoryIndex = 0;
let categories = [];
let availableQuestions = {}; 
let answeredCounts = {};
let scores = {};
let maxScores = {}; // 记录理论最大绝对值，用于归一化计算
let topMatches = []; // 存储最终前三名结果

// ================= 初始化与数据加载 =================

window.onload = async () => {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error("无法读取 data.json");
        DB = await res.json();
        
        // 激活开始按钮
        const btn = document.getElementById('start-btn');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "开始测试 Mission Start!";
        }
        const loadingMsg = document.getElementById('loading-msg');
        if(loadingMsg) loadingMsg.style.display = 'none';
        
        // 预初始化数据
        initGame();
    } catch (e) {
        alert("错误：无法加载数据文件。\n请确保 data.json 存在且格式正确。\n注意：本文件需在本地服务器(localhost)环境下运行，不可直接双击打开。");
        console.error(e);
        const loadingMsg = document.getElementById('loading-msg');
        if(loadingMsg) loadingMsg.innerText = "加载失败: " + e.message;
    }
};

function initGame() {
    categories = DB.meta.question_logic.categories;
    
    // 1. 准备题库：深拷贝并随机打乱
    categories.forEach(cat => {
        if(DB.questions[cat]) {
            availableQuestions[cat] = [...DB.questions[cat]];
            availableQuestions[cat].sort(() => Math.random() - 0.5);
        } else {
            console.warn(`分类 ${cat} 在 questions 中不存在`);
            availableQuestions[cat] = [];
        }
        answeredCounts[cat] = 0;
    });
    
    // 2. 重置分数
    for (let axis in DB.meta.axes) {
        scores[axis] = 0;
        maxScores[axis] = 0;
    }
}

function showScreen(id) {
    document.querySelectorAll('.card').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo(0, 0);
}

function startTest() {
    initGame(); // 确保每次点击开始都是全新状态
    showScreen('quiz-screen');
    loadNextQuestion();
}

// ================= 核心答题逻辑 =================

function loadNextQuestion() {
    // 检查是否所有题目已耗尽
    const allDone = categories.every(cat => availableQuestions[cat].length === 0);
    if (allDone) {
        finishTest();
        return;
    }

    // 轮询算法：寻找下一个还有余题的分类
    let attempts = 0;
    let category = categories[currentCategoryIndex];
    
    while (availableQuestions[category].length === 0 && attempts < categories.length) {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        category = categories[currentCategoryIndex];
        attempts++;
    }

    // 双重保险，防止死循环
    if (attempts >= categories.length || availableQuestions[category].length === 0) {
        finishTest();
        return;
    }

    // 取出一道题
    const question = availableQuestions[category].pop();
    renderQuestion(question, category);
    
    // 移动指针到下一个分类，为下一轮做准备
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
}

function renderQuestion(question, category) {
    // 映射中文分类名用于显示
    const catMap = {
        "economy": "💰 经济", "diplomacy": "🌏 外交", 
        "governance": "🏛️ 政治", "culture": "🎭 社会", 
        "environment": "🌲 环境"
    };
    
    const catEl = document.getElementById('q-category');
    catEl.innerText = catMap[category] || category;
    catEl.className = `category-badge cat-${category}`; // CSS颜色适配
    
    document.getElementById('question-text').innerText = question.text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    question.options.forEach((opt) => {
        const btn = document.createElement('div');
        btn.className = 'option-card';
        btn.innerText = opt.text;
        // 绑定点击事件，闭包传参
        btn.onclick = () => handleAnswer(opt.effects, category);
        container.appendChild(btn);
    });
    
    updateProgress();
    checkSkipCondition();
}

function handleAnswer(effects, category) {
    // 计分
    for (let axis in effects) {
        // 只有 meta 中定义的维度才计分，防止脏数据
        if (DB.meta.axes.hasOwnProperty(axis)) {
            const val = effects[axis];
            scores[axis] += val;
            maxScores[axis] += Math.abs(val); // 累加绝对值，作为分母
        }
    }
    
    answeredCounts[category]++;
    
    // 稍微延迟，让用户感觉到点击反馈
    setTimeout(() => {
        loadNextQuestion();
    }, 150);
}

function checkSkipCondition() {
    const threshold = DB.meta.question_logic.questions_per_category_before_skip;
    // 检查是否每个分类都至少回答了 N 题
    const canSkip = categories.every(cat => answeredCounts[cat] >= threshold);
    
    const btn = document.getElementById('btn-finish-early');
    if (canSkip) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function updateProgress() {
    const totalAnswered = Object.values(answeredCounts).reduce((a,b)=>a+b, 0);
    // 估算总题数（例如 5类 * 10题 = 50）
    const estimatedTotal = 50; 
    document.getElementById('q-progress').innerText = totalAnswered;
    
    const pct = Math.min(100, (totalAnswered / estimatedTotal) * 100);
    document.getElementById('progress-bar').style.width = `${pct}%`;
}

// ================= 结果计算与渲染 =================

function finishTest() {
    showScreen('result-screen');
    calculateResults();
}

function calculateResults() {
    // 1. 归一化用户分数 (-100 到 100)
    let userStats = {};
    let totalPassion = 0; // "激情值"总和，用于判断用户是否观点鲜明
    
    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis];
        
        if (max === 0) max = 1; // 防止除零
        
        let ratio = raw / max;
        // 映射到 -100 ~ 100
        userStats[axis] = ratio * 100;
        
        // 累加绝对值
        totalPassion += Math.abs(userStats[axis]);
    }
    
    // 渲染维度条
    renderAxesCharts(userStats);

    // 2. 匹配算法 (欧氏距离 + 反中间派偏置)
    let matches = [];
    DB.ideologies.forEach(ideo => {
        let dist = 0;
        let dimensionsCount = 0;
        
        for (let axis in ideo.stats) {
            if (userStats[axis] !== undefined) {
                let diff = userStats[axis] - ideo.stats[axis];
                dist += Math.pow(diff, 2);
                dimensionsCount++;
            }
        }
        
        if (dimensionsCount > 0) {
            let finalDist = Math.sqrt(dist);

            // --- 关键算法优化：反中间派偏置 ---
            // 如果用户总激情值较高 (>150，说明观点鲜明)，且该阵营名称包含"中间派"，
            // 则人为增加距离惩罚，防止因平均值巧合而误判为中间派。
            if (ideo.name.includes("中间派") && totalPassion > 150) {
                finalDist += 50; // 惩罚距离
            }

            matches.push({ ...ideo, dist: finalDist });
        }
    });

    matches.sort((a, b) => a.dist - b.dist);
    topMatches = matches.slice(0, 3); // 取前三名

    // 3. 渲染结果
    if (topMatches.length > 0) {
        renderBestMatch(topMatches[0]);
    }
    if (topMatches.length > 1) {
        renderSubMatches(topMatches.slice(1, 3));
    }
}

// 渲染冠军展示区
function renderBestMatch(data) {
    const container = document.getElementById('best-match-container');
    
    // 计算匹配度 (简单反转：距离越小百分比越高)
    let matchPct = Math.max(0, 100 - (data.dist / 2.5)).toFixed(0);

    // 辅助函数：处理数组或字符串
    const formatTags = (items) => {
        if (!items) return "暂无数据";
        if (Array.isArray(items)) return items.map(i => `<span class="figure-tag">${i}</span>`).join('');
        return items; // 兼容旧格式字符串
    };

    const formatList = (items) => {
        if (!items) return "<li>暂无推荐</li>";
        if (Array.isArray(items)) return items.map(i => `<li>${i}</li>`).join('');
        return `<li>${items}</li>`;
    };

    let quoteHtml = '';
    if (data.quote) {
        quoteHtml = `
            <div class="quote-box">
                <p class="quote-text">“${data.quote.text}”</p>
                <p class="quote-author">—— ${data.quote.author}</p>
            </div>`;
    }

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
                <div>
                    <h4>🗿 代表人物</h4>
                    <div class="tag-container">${formatTags(data.figures)}</div>
                </div>
                <div>
                    <h4>📚 推荐书籍</h4>
                    <ul class="book-list">${formatList(data.books)}</ul>
                </div>
            </div>
            ${quoteHtml}
        </div>
    `;
}

// 渲染亚季军候选区
function renderSubMatches(matches) {
    const container = document.getElementById('sub-matches-container');
    container.innerHTML = '';

    matches.forEach((m, idx) => {
        // idx 是 sub array 的索引，对应真实排名是 idx + 2 (第2名和第3名)
        let realRank = idx + 2; 
        let matchPct = Math.max(0, 100 - (m.dist / 2.5)).toFixed(0);
        let icon = realRank === 2 ? '🥈' : '🥉';

        container.innerHTML += `
            <div class="sub-match-card" onclick="showDetail(${realRank - 1})"> <!-- 传入 topMatches 索引 -->
                <div class="sub-left">
                    <h4 style="margin:0;">${icon} ${m.name}</h4>
                    <small>点击查看详情</small>
                </div>
                <div class="sub-right">
                    <span class="sub-pct">${matchPct}%</span>
                </div>
            </div>
        `;
    });
}

// 渲染维度分析图 (带百分比)
function renderAxesCharts(userStats) {
    const container = document.getElementById('axes-results');
    container.innerHTML = '';
    
    for(let axis in DB.meta.axes) {
        const meta = DB.meta.axes[axis];
        const val = userStats[axis]; // -100 ~ 100
        
        // 转换为 0 ~ 100 的百分比用于 CSS 宽度
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

// ================= 弹窗逻辑 =================

function showDetail(idx) {
    // idx 是 topMatches 数组的索引 (0, 1, 2)
    const data = topMatches[idx];
    if (!data) return;

    document.getElementById('modal-title').innerText = data.name;
    document.getElementById('modal-desc').innerText = data.desc;
    
    // 渲染人物 (兼容数组)
    const figuresDiv = document.getElementById('modal-figures');
    if (Array.isArray(data.figures)) {
        figuresDiv.innerHTML = data.figures.map(f => `<span class="figure-tag">${f}</span>`).join('');
    } else {
        figuresDiv.innerHTML = data.figures || "无数据";
    }

    // 渲染名言
    const quoteBox = document.getElementById('modal-quote');
    if(data.quote) {
        quoteBox.innerHTML = `
            <p class="quote-text">“${data.quote.text}”</p>
            <p class="quote-author">—— ${data.quote.author}</p>
        `;
    } else {
        quoteBox.innerHTML = "";
    }

    // 渲染书籍
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

// 点击背景关闭弹窗
window.onclick = function(e) {
    if(e.target == document.getElementById('detail-modal')) closeDetail();
}