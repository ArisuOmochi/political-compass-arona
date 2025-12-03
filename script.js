/**
 * Arona Political Compass - Core Logic
 * Version: 2025.0 Ultimate
 */

let DB = null;
let currentQuestionIndex = 0;
let userAnswers = []; // 存储用户的选择 (用于撤销)
let scores = {};
let maxScores = {};
let mode = 'basic'; // 'basic' or 'extended'
const BASIC_LIMIT = 100;
const EXTENDED_LIMIT = 150;

// 全局变量存储 Top 3 结果，供弹窗使用
window.currentTop3 = [];

// ================= 初始化 =================

window.onload = async () => {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        DB = await response.json();
        initScores();
        console.log("✅ 题库加载成功:", DB.ideologies.length, "个阵营");
    } catch (e) {
        alert("⚠️ 无法加载 data.json。\n请确保文件存在，且通过 GitHub Pages 或本地服务器 (localhost) 访问。\n直接双击打开 html 文件通常会因为浏览器安全策略导致跨域错误。");
        console.error(e);
    }
};

function initScores() {
    // 动态初始化维度分数
    for (let axis in DB.meta.axes) {
        scores[axis] = 0.0;
        maxScores[axis] = 0.0;
    }
}

// ================= 导航逻辑 =================

function showScreen(screenId) {
    const screens = ['start-screen', 'quiz-screen', 'inter-screen', 'result-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
    
    // 滚动到顶部
    window.scrollTo(0, 0);
}

function startTest() {
    showScreen('quiz-screen');
    loadQuestion();
}

// ================= 答题逻辑 =================

function loadQuestion() {
    if (!DB) return;
    const q = DB.questions[currentQuestionIndex];
    document.getElementById('question-text').innerText = `${currentQuestionIndex + 1}. ${q.text}`;
    
    // 更新进度条
    const total = mode === 'basic' ? BASIC_LIMIT : EXTENDED_LIMIT;
    document.getElementById('q-progress').innerText = currentQuestionIndex + 1;
    document.getElementById('q-total').innerText = total;
    
    const percent = ((currentQuestionIndex) / total) * 100;
    document.getElementById('progress-bar').style.width = `${percent}%`;

    // 撤销按钮状态
    document.getElementById('btn-undo').disabled = currentQuestionIndex === 0;
}

function answer(choice) {
    const weight = DB.meta.options_map[choice].weight;
    const q = DB.questions[currentQuestionIndex];
    
    // 记录历史
    userAnswers.push({
        axis: q.axis,
        effect: q.effect,
        weight: weight
    });

    // 计分
    scores[q.axis] += q.effect * weight;
    maxScores[q.axis] += Math.abs(q.effect);

    currentQuestionIndex++;

    // 检查节点
    if (currentQuestionIndex === BASIC_LIMIT && mode === 'basic') {
        showScreen('inter-screen');
    } else if (currentQuestionIndex === EXTENDED_LIMIT) {
        finishTest();
    } else {
        loadQuestion();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        const lastAns = userAnswers.pop();
        // 回滚分数
        scores[lastAns.axis] -= lastAns.effect * lastAns.weight;
        maxScores[lastAns.axis] -= Math.abs(lastAns.effect);
        loadQuestion();
    }
}

function enterExtendedMode() {
    mode = 'extended';
    alert("⚡ 已进入【深水区】。\n后续题目可能包含极端、不适或反直觉的哲学拷问。\n请做好心理准备！");
    showScreen('quiz-screen');
    loadQuestion();
}

function finishTest() {
    showScreen('result-screen');
    renderResults();
}

// ================= 结果渲染与匹配算法 =================

function renderResults() {
    const axesMeta = DB.meta.axes;
    const userStats = {};
    const resultsContainer = document.getElementById('axes-results');
    resultsContainer.innerHTML = '';
    
    let hasExtremeViews = false; // 标记是否有极端观点

    // --- 1. 计算各维度百分比并渲染条形图 ---
    for (let axis in axesMeta) {
        const info = axesMeta[axis];
        const current = scores[axis];
        let maximum = maxScores[axis];
        if (maximum === 0) maximum = 1; // 防止除零

        // 归一化算法: (分数 / 最大可能分数 + 1) / 2 * 100
        const ratio = (current / maximum + 1) / 2;
        let percent = ratio * 100;
        percent = Math.max(0, Math.min(100, percent)); // 限制在 0-100
        userStats[axis] = percent;

        // 拒绝平庸逻辑：只要有一个维度偏离 40-60 区间，就不再是纯粹的中间派
        if (percent > 60 || percent < 40) {
            hasExtremeViews = true;
        }

        // 确定倾向文案
        let tendency = "中立";
        if (percent < 40) tendency = `倾向 ${info.left}`;
        if (percent < 15) tendency = `极端 ${info.left}`;
        if (percent > 60) tendency = `倾向 ${info.right}`;
        if (percent > 85) tendency = `极端 ${info.right}`;

        // 渲染进度条 HTML
        const html = `
            <div class="axis-container">
                <div class="axis-title">
                    <span>${info.name}</span>
                    <span style="font-weight:normal; font-size:0.9em">${tendency} (${percent.toFixed(1)}%)</span>
                </div>
                <div class="bar-wrapper">
                    <!-- 左边蓝色，右边红色 -->
                    <div class="bar-left" style="width: ${100 - percent}%"></div>
                    <div class="bar-right" style="width: ${percent}%"></div>
                </div>
                <div class="axis-labels">
                    <span>${info.left}</span>
                    <span>${info.right}</span>
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('beforeend', html);
    }

    // --- 2. 核心算法：计算所有阵营的匹配度 ---
    let matches = [];

    // 计算最大可能的欧几里得距离 
    // 假设有 N 个维度，每个维度最大差值为 100 (0 vs 100)
    // MaxDist = sqrt(N * 100^2) = 100 * sqrt(N)
    const dimCount = Object.keys(axesMeta).length;
    const MAX_POSSIBLE_DIST = 100 * Math.sqrt(dimCount); 

    for (let ideology of DB.ideologies) {
        // 【拒绝平庸补丁】
        // 如果用户有极端观点，强制屏蔽“中间派/政治冷感”
        // 避免温和保守派被吸入中间派黑洞
        if (hasExtremeViews && (ideology.name.includes("中间派") || ideology.name.includes("政治冷感"))) {
            continue;
        }

        let dist = 0;
        let validCount = 0;

        for (let axis in axesMeta) {
            // 确保该阵营定义了这个维度的数据
            if (ideology.stats[axis] !== undefined) {
                const diff = userStats[axis] - ideology.stats[axis];
                dist += Math.pow(diff, 2);
                validCount++;
            }
        }

        if (validCount > 0) {
            dist = Math.sqrt(dist);
            
            // 计算匹配百分比 (线性反转)
            // 距离 0 => 100% 匹配
            // 距离 Max => 0% 匹配
            let matchScore = (1 - (dist / MAX_POSSIBLE_DIST)) * 100;
            
            // 修正：增加区分度，让高分更高 (可选，这里用简单的 Math.pow 增加曲线陡峭度)
            // matchScore = Math.pow(matchScore / 100, 1.5) * 100; 
            
            // 简单线性修正
            matchScore = Math.max(0, matchScore); 
            
            matches.push({
                ...ideology,
                matchPct: matchScore.toFixed(1), // 保留1位小数
                rawDist: dist
            });
        }
    }

    // 按匹配度从高到低排序
    matches.sort((a, b) => b.matchPct - a.matchPct);

    // 取前 3 名
    // 如果 matches 为空（极罕见），兜底显示第一个
    if (matches.length === 0) {
        matches.push(DB.ideologies[0]);
    }
    
    const top3 = matches.slice(0, 3);
    window.currentTop3 = top3; // 存入全局，供弹窗使用

    // --- 3. 渲染 Top 3 列表 ---
    const topContainer = document.getElementById('top-matches-container');
    if (topContainer) {
        topContainer.innerHTML = ''; // 清空

        top3.forEach((item, index) => {
            const rankClass = index === 0 ? 'rank-1' : '';
            const icon = index === 0 ? '🥇' : (index === 1 ? '🥈' : '🥉');
            
            const html = `
                <div class="match-card ${rankClass}" onclick="showDetail(${index})">
                    <div class="match-info">
                        <h3>${icon} ${item.name}</h3>
                        <div style="font-size: 0.8rem; color: #666; margin-top:4px;">点击查看详情 &raquo;</div>
                    </div>
                    <div class="match-pct">${item.matchPct}%</div>
                </div>
            `;
            topContainer.insertAdjacentHTML('beforeend', html);
        });
    }
}

// ================= 详情弹窗逻辑 =================

function showDetail(index) {
    const data = window.currentTop3[index];
    if (!data) return;

    // 填充内容
    document.getElementById('modal-title').innerText = data.name;
    document.getElementById('modal-desc').innerText = data.desc;
    document.getElementById('modal-figures').innerText = data.figures || "暂无数据";
    
    // 名言处理
    const quoteDiv = document.getElementById('modal-quote');
    if (data.quote) {
        quoteDiv.innerHTML = `“${data.quote.text}”<br><br><small>— ${data.quote.author} (${data.quote.trans || ''})</small>`;
        quoteDiv.style.display = 'block';
    } else {
        quoteDiv.style.display = 'none';
    }

    // 书单处理
    const bookList = document.getElementById('modal-books');
    if (data.books && data.books.length > 0) {
        bookList.innerHTML = data.books.map(b => `<li>${b}</li>`).join('');
    } else {
        bookList.innerHTML = '<li>暂无推荐</li>';
    }

    // 显示弹窗 (移除 hidden class)
    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// 点击背景关闭弹窗
window.onclick = function(event) {
    const modal = document.getElementById('detail-modal');
    if (event.target == modal) {
        closeDetail();
    }
}