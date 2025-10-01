// --- Game Parameters ---
const START_BALANCE = 100000;
const COINS = {
  BTC: {
    price: 27000,
    circulation: 1700,
    max: 2100,
    volatility: 0.019, // bot effect per tick %
    minPrice: 5000,
    maxPrice: 72000,
  },
  LTC: {
    price: 70,
    circulation: 6600,
    max: 8400,
    volatility: 0.025,
    minPrice: 20,
    maxPrice: 350,
  }
};
const TICK_INTERVAL = 3500; // ms - market tick
const BOT_COUNT = 6; // bots trading per tick

// --- Event State ---
let eventState = {
  hypeCooldown: 0,
  crashCooldown: 0,
  pumpFlag: { BTC: false, LTC: false },
  dumpCooldown: { BTC: 0, LTC: 0 }
};

// --- Game State ---
let state = {
  usd: START_BALANCE,
  portfolio: {
    BTC: 0,
    LTC: 0,
  },
  coins: {
    BTC: { price: COINS.BTC.price, circulation: COINS.BTC.circulation },
    LTC: { price: COINS.LTC.price, circulation: COINS.LTC.circulation },
  },
  history: {
    BTC: [],
    LTC: [],
  },
  log: [],
};

// --- Chart.js ---
let btcChart, ltcChart;

// --- Utility ---
function saveState() {
  localStorage.setItem('cryptoSimState', JSON.stringify(state));
}
function loadState() {
  const s = localStorage.getItem('cryptoSimState');
  if (s) state = JSON.parse(s);
}
function format(n, decimals=2) {
  return Number(n).toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}
function log(msg) {
  state.log.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (state.log.length > 32) state.log.length = 32;
  updateLog();
  saveState();
}

// --- DOM Update ---
function updateUI() {
  document.getElementById('usd-balance').textContent = format(state.usd,0);
  document.getElementById('btc-owned').textContent = format(state.portfolio.BTC,6);
  document.getElementById('ltc-owned').textContent = format(state.portfolio.LTC,6);

  document.getElementById('btc-price').textContent = format(state.coins.BTC.price,2);
  document.getElementById('ltc-price').textContent = format(state.coins.LTC.price,2);

  document.getElementById('btc-circulation').textContent = format(state.coins.BTC.circulation,0);
  document.getElementById('btc-max').textContent = format(COINS.BTC.max,0);

  document.getElementById('ltc-circulation').textContent = format(state.coins.LTC.circulation,0);
  document.getElementById('ltc-max').textContent = format(COINS.LTC.max,0);

  updateCharts();
  updateLog();
}
function updateLog() {
  const logDiv = document.getElementById('game-log');
  logDiv.innerHTML = state.log.slice(0,14).map(x => `<div>${x}</div>`).join('');
}

function updateCharts() {
  btcChart.data.labels = state.history.BTC.map(h => h.time);
  btcChart.data.datasets[0].data = state.history.BTC.map(h => h.price);
  btcChart.update();
  ltcChart.data.labels = state.history.LTC.map(h => h.time);
  ltcChart.data.datasets[0].data = state.history.LTC.map(h => h.price);
  ltcChart.update();
}

// --- Buy/Sell ---
window.buyCoin = function(coin) {
  const amtInput = document.getElementById(coin.toLowerCase() + '-amount');
  let amt = parseFloat(amtInput.value);
  amtInput.value = '';
  if (!amt || amt <= 0) return log(`Invalid amount to buy: ${amt}`);
  let price = state.coins[coin].price;
  let cost = amt * price;

  // If trying to buy more than circulation, just buy all that's left
  if (amt > state.coins[coin].circulation) {
    amt = state.coins[coin].circulation;
    cost = amt * price;
    log(`Requested more than circulation; buying remaining ${format(amt,6)} ${coin}.`);
  }
  if (amt <= 0) return log(`No ${coin} left to buy.`);
  if (cost > state.usd) return log(`Insufficient USD to buy ${amt} ${coin}.`);

  state.usd -= cost;
  state.portfolio[coin] += amt;
  state.coins[coin].circulation -= amt;

  log(`You bought ${format(amt,6)} ${coin} for $${format(cost,2)}.`);
  checkCirculation(coin);
  saveState();
  updateUI();
}

window.sellCoin = function(coin) {
  const amtInput = document.getElementById(coin.toLowerCase() + '-amount');
  let amt = parseFloat(amtInput.value);
  amtInput.value = '';
  if (!amt || amt <= 0) return log(`Invalid amount to sell: ${amt}`);
  if (amt > state.portfolio[coin]) return log(`You do not own enough ${coin} to sell.`);
  let price = state.coins[coin].price;
  let proceeds = amt * price;

  state.usd += proceeds;
  state.portfolio[coin] -= amt;
  state.coins[coin].circulation += amt;

  log(`You sold ${format(amt,6)} ${coin} for $${format(proceeds,2)}.`);
  saveState();
  updateUI();
}

// --- Circulation Event with Pump & Dump ---
function checkCirculation(coin) {
  if (state.coins[coin].circulation <= 0) {
    state.coins[coin].circulation = 0;
    log(`!! All ${coin} have been bought out! Bots will drive prices up sharply until new coins are mined.`);
    // Pump: price spike
    state.coins[coin].price *= 1.05 + Math.random()*0.08;
    if (state.coins[coin].price > COINS[coin].maxPrice*2) state.coins[coin].price = COINS[coin].maxPrice*2;
    eventState.pumpFlag[coin] = true; // Set pump flag for possible dump
    // "Mint" some new coins randomly after a few ticks
    setTimeout(() => {
      let mint = Math.floor(COINS[coin].max * 0.01 * Math.random());
      state.coins[coin].circulation += mint;
      log(`Miners released ${mint} new ${coin} into circulation.`);
      // DUMP: Only if pump just happened
      if (eventState.pumpFlag[coin]) {
        let dumpPercent = 0.3 + Math.random() * 0.2; // 30–50% drop
        let oldPrice = state.coins[coin].price;
        state.coins[coin].price *= (1 - dumpPercent);
        if (state.coins[coin].price < COINS[coin].minPrice) state.coins[coin].price = COINS[coin].minPrice;
        log(`Pump & Dump! ${coin} price crashes by ${(dumpPercent*100).toFixed(1)}% after new coins hit the market!`);
        eventState.pumpFlag[coin] = false;
      }
      saveState();
      updateUI();
    }, 4000 + Math.random()*5000);
  }
}

// --- Random Events: Hype & Market Crash ---
function maybeTriggerEvents() {
  // Reduce cooldowns
  if (eventState.hypeCooldown > 0) eventState.hypeCooldown--;
  if (eventState.crashCooldown > 0) eventState.crashCooldown--;
  eventState.dumpCooldown.BTC = Math.max(0, eventState.dumpCooldown.BTC-1);
  eventState.dumpCooldown.LTC = Math.max(0, eventState.dumpCooldown.LTC-1);

  // HYPE: 1.5% chance per tick, only if not on cooldown
  if (eventState.hypeCooldown === 0 && Math.random() < 0.015) {
    let coin = Math.random() < 0.5 ? 'BTC' : 'LTC';
    let percent = 0.10 + Math.random()*0.15; // 10–25%
    let oldPrice = state.coins[coin].price;
    state.coins[coin].price *= (1 + percent);
    if (state.coins[coin].price > COINS[coin].maxPrice*2) state.coins[coin].price = COINS[coin].maxPrice*2;
    log(`Hype event! ${coin} is trending 🚀 (+${(percent*100).toFixed(1)}%)`);
    eventState.hypeCooldown = 15 + Math.floor(Math.random()*10); // ~50sec cooldown
  }

  // CRASH: 1.5% chance per tick, only if not on cooldown
  if (eventState.crashCooldown === 0 && Math.random() < 0.015) {
    let targets = Math.random() < 0.5 ? ['BTC'] : ['LTC','BTC']; // sometimes both, sometimes one
    let percent = 0.2 + Math.random()*0.2; // 20–40%
    targets.forEach(coin => {
      let oldPrice = state.coins[coin].price;
      state.coins[coin].price *= (1 - percent);
      if (state.coins[coin].price < COINS[coin].minPrice) state.coins[coin].price = COINS[coin].minPrice;
      log(`Market crash! ${coin} price plummets by ${(percent*100).toFixed(1)}%! 💥`);
    });
    eventState.crashCooldown = 17 + Math.floor(Math.random()*10); // ~60sec cooldown
  }
}

// --- Bot Market Simulation ---
function botMarketTick() {
  maybeTriggerEvents();
  for (let c of ['BTC','LTC']) {
    let coin = state.coins[c];
    let price = coin.price;
    let circulation = coin.circulation;

    // bots trade: buy/sell randomly, affecting price and circulation
    for (let i=0; i<BOT_COUNT; ++i) {
      let direction = Math.random() > 0.47 ? 1 : -1; // buy or sell
      let amount = Math.max(0.1, Math.random() * (c === 'BTC' ? 4 : 80));
      // If buy and enough coins in circulation
      if (direction === 1 && circulation > amount) {
        circulation -= amount;
        price *= 1 + COINS[c].volatility * Math.random();
      }
      // If sell and not exceeding max
      else if (direction === -1 && circulation + amount <= COINS[c].max) {
        circulation += amount;
        price *= 1 - COINS[c].volatility * Math.random();
      }
    }

    // Clamp
    if (price < COINS[c].minPrice) price = COINS[c].minPrice;
    if (price > COINS[c].maxPrice) price = COINS[c].maxPrice;

    coin.price = price;
    coin.circulation = circulation;

    // Record price history for chart
    if (state.history[c].length > 100) state.history[c].shift();
    state.history[c].push({time: new Date().toLocaleTimeString(), price: price});
  }
  saveState();
  updateUI();
}

// --- Game Reset ---
window.resetGame = function() {
  if (!confirm('Restart game? All progress will be lost.')) return;
  state = {
    usd: START_BALANCE,
    portfolio: {BTC:0,LTC:0},
    coins: {
      BTC: { price: COINS.BTC.price, circulation: COINS.BTC.circulation },
      LTC: { price: COINS.LTC.price, circulation: COINS.LTC.circulation },
    },
    history: {
      BTC: [ {time: new Date().toLocaleTimeString(), price: COINS.BTC.price} ],
      LTC: [ {time: new Date().toLocaleTimeString(), price: COINS.LTC.price} ],
    },
    log: [],
  };
  // Reset event state as well
  eventState = {
    hypeCooldown: 0,
    crashCooldown: 0,
    pumpFlag: { BTC: false, LTC: false },
    dumpCooldown: { BTC: 0, LTC: 0 }
  };
  saveState();
  updateUI();
}

// --- Init ---
function initCharts() {
  const btcCtx = document.getElementById('btc-chart').getContext('2d');
  const ltcCtx = document.getElementById('ltc-chart').getContext('2d');
  btcChart = new Chart(btcCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [ {
        label: 'BTC Price',
        backgroundColor: '#3143c5',
        borderColor: '#4c8aff',
        data: [],
        fill: false,
        pointRadius: 2,
        borderWidth: 2,
      }]
    },
    options: {
      plugins: {legend: {labels: {color:'#e0e0e0'}}},
      scales: {
        x: { display: false },
        y: { color:'#e0e0e0', beginAtZero: false, ticks: { color:'#e0e0e0' } }
      }
    }
  });
  ltcChart = new Chart(ltcCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [ {
        label: 'LTC Price',
        backgroundColor: '#3143c5',
        borderColor: '#4c8aff',
        data: [],
        fill: false,
        pointRadius: 2,
        borderWidth: 2,
      }]
    },
    options: {
      plugins: {legend: {labels: {color:'#e0e0e0'}}},
      scales: {
        x: { display: false },
        y: { color:'#e0e0e0', beginAtZero: false, ticks: { color:'#e0e0e0' } }
      }
    }
  });
}

function startGame() {
  loadState();
  if (!state.history.BTC || !state.history.LTC) {
    state.history.BTC = [ {time: new Date().toLocaleTimeString(), price: state.coins.BTC.price} ];
    state.history.LTC = [ {time: new Date().toLocaleTimeString(), price: state.coins.LTC.price} ];
  }
  initCharts();
  updateUI();
  setInterval(botMarketTick, TICK_INTERVAL);
}

window.onload = startGame;

// --- Admin Menu Logic ---
window.showAdminMenu = function() {
  document.getElementById('admin-modal').style.display = 'block';
  document.getElementById('admin-login').style.display = '';
  document.getElementById('admin-controls').style.display = 'none';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-status').textContent = '';
};

window.hideAdminMenu = function() {
  document.getElementById('admin-modal').style.display = 'none';
};

window.adminLogin = function() {
  const pwd = document.getElementById('admin-password').value;
  if (pwd === 'RealybyIsEpic') {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-controls').style.display = '';
    document.getElementById('admin-status').textContent = '';
  } else {
    document.getElementById('admin-status').textContent = 'Incorrect password!';
    document.getElementById('admin-password').value = '';
  }
};

window.giveMoney = function() {
  const amt = Number(document.getElementById('admin-money').value);
  if (!amt || amt <= 0) {
    document.getElementById('admin-status').textContent = 'Enter a valid amount.';
    return;
  }
  state.usd += amt;
  log(`Admin gave the player $${format(amt,2)}.`);
  document.getElementById('admin-status').textContent = `Gave $${format(amt,2)} to player.`;
  document.getElementById('admin-money').value = '';
  updateUI();
  saveState();
};
