// ==========================================
// 全局状态管理
// ==========================================
let appData = null;      
let currentQIndex = 0;   
let scores = {};         
let historyStack = [];   

// ==========================================
// 1. 初始化
// ==========================================
async function init() {
    try {
        const btn = document.querySelector('.start-btn');
        const res = await fetch('data.json?v=' + new Date().getTime());
        if (!res.ok) throw new Error("Load failed");
        
        appData = await res.json();
        console.log("配置加载成功:", appData.meta.title);
        
        Object.keys(appData.dimensions).forEach(key => scores[key] = 0);

        btn.disabled = false;
        btn.innerText = "开始查成分";
    } catch (err) {
        console.error(err);
        alert("数据加载失败，请检查环境 (需在服务器/localhost运行)");
    }
}
init();

// ==========================================
// 2. 游戏流程控制
// ==========================================
function startTest() {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    renderQuestion();
}

function renderQuestion() {
    const q = appData.questions[currentQIndex];
    
    document.getElementById('q-number').innerText = currentQIndex + 1;
    document.getElementById('question-text').innerText = q.text;
    
    const progress = (currentQIndex / appData.questions.length) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;

    const undoBtn = document.getElementById('undo-btn');
    if (currentQIndex > 0) undoBtn.classList.remove('hidden');
    else undoBtn.classList.add('hidden');

    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn option-btn';
        btn.innerText = opt.text;
        btn.onclick = () => handleAnswer(opt.scores);
        container.appendChild(btn);
    });
}

function handleAnswer(choiceScores) {
    historyStack.push(choiceScores);
    if (choiceScores) {
        for (let key in choiceScores) {
            if (scores.hasOwnProperty(key)) scores[key] += choiceScores[key];
        }
    }
    currentQIndex++;
    if (currentQIndex < appData.questions.length) {
        renderQuestion();
    } else {
        calculateAndShowResult();
    }
}

function undoLastAnswer() {
    if (currentQIndex === 0 || historyStack.length === 0) return;
    const lastChange = historyStack.pop();
    if (lastChange) {
        for (let key in lastChange) {
            if (scores.hasOwnProperty(key)) scores[key] -= lastChange[key];
        }
    }
    currentQIndex--;
    renderQuestion();
}

// ==========================================
// 3. 结果计算引擎 (增加排他性逻辑)
// ==========================================
function calculateAndShowResult() {
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('progress-fill').style.width = '100%';

    const rules = appData.results;
    
    // 辅助状态
    const isHater = scores.game_hater > scores.game_mihoyo;
    const isLoveHate = scores.game_hater >= 8 && scores.game_mihoyo >= 8;

    // 排序
    let sortedDims = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let topDim = sortedDims[0][0]; 
    let topScore = sortedDims[0][1];
    let secondDim = sortedDims[1] ? sortedDims[1][0] : null;

    let finalNoun = null;
    let finalPrefix = "";
    let finalEmoji = rules.fallback.emoji;
    let finalDesc = "";

    // === Step A: 检查 Combos (增加 exclusions 检查) ===
    for (let combo of rules.combos) {
        let match = true;
        
        // 1. 基础条件检查 (分数必须达标)
        for (let key in combo.conditions) {
            if (scores[key] < combo.conditions[key]) {
                match = false;
                break;
            }
        }

        // 2. 特殊开关检查
        if (combo.exclude_hater && isHater) match = false;

        // 3. === 新增：排他性检查 (关键修复) ===
        // 如果定义了 exclusions，只要有任何一项分数超标，就禁止触发该 Combo
        if (match && combo.exclusions) {
            for (let exKey in combo.exclusions) {
                // 如果你的某项排斥分数 >= 设定阈值，则不匹配
                if (scores[exKey] >= combo.exclusions[exKey]) {
                    match = false;
                    break;
                }
            }
        }

        if (match) {
            finalPrefix = ""; 
            finalNoun = combo.name;
            finalEmoji = combo.emoji;
            finalDesc = combo.desc;
            break; 
        }
    }

    // === Step B: 常规逻辑 (保持不变) ===
    if (!finalNoun) {
        for (let rule of rules.nouns) {
            let match = false;
            if (rule.condition.custom === "high_love_hate") {
                if (isLoveHate) match = true;
            } else if (rule.condition.dimension) {
                const dimKey = rule.condition.dimension;
                const threshold = rule.condition.min;
                if (rule.condition.exclude_hater && isHater) {
                    match = false;
                } else {
                    if (scores[dimKey] >= threshold) match = true;
                }
            }
            if (match) {
                finalNoun = rule.name;
                finalEmoji = rule.emoji;
                break; 
            }
        }
        
        if (!finalNoun) {
            finalNoun = rules.fallback.noun;
            finalEmoji = rules.fallback.emoji;
            finalDesc = rules.fallback.desc;
        }

        let bestPrefixScore = -999;
        for (let p of rules.prefixes) {
            let s = scores[p.dim];
            if (p.dim === "game_mihoyo" && isHater) continue;
            if (s > 5 && s > bestPrefixScore) { 
                finalPrefix = p.text;
                bestPrefixScore = s;
            }
        }
        
        if (!finalDesc) {
            finalDesc = `你的核心成分是 ${appData.dimensions[topDim]} 和 ${appData.dimensions[secondDim] || '无'}。`;
        }
    }

    // 渲染
    document.getElementById('result-emoji').innerText = finalEmoji;
    document.getElementById('result-label').innerText = `${finalPrefix}${finalNoun}`;
    document.getElementById('result-desc').innerText = finalDesc;
}

function restartTest() {
    Object.keys(scores).forEach(key => scores[key] = 0);
    currentQIndex = 0;
    historyStack = []; 
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('welcome-screen').classList.remove('hidden');
}

function generateShareImage() {
    const element = document.getElementById('capture-area');
    const watermark = document.querySelector('.hidden-watermark');
    if(!window.html2canvas) return alert("组件加载失败");
    watermark.style.display = 'block';
    const originalPadding = element.style.padding;
    element.style.padding = '40px 20px'; 
    html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" })
    .then(canvas => {
        watermark.style.display = 'none';
        element.style.padding = originalPadding;
        showModal(canvas.toDataURL("image/png"));
    }).catch(err => {
        console.error(err);
        watermark.style.display = 'none';
        element.style.padding = originalPadding;
    });
}

function showModal(src) {
    const box = document.getElementById('img-container');
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    box.appendChild(img);
    document.getElementById('image-modal').classList.remove('hidden');
}
function closeModal() {
    document.getElementById('image-modal').classList.add('hidden');
}