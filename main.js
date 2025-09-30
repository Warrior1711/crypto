// --- Game Parameters ---
const START_BALANCE = 100000;
const COINS = {
  BTC: {
    price: 27000,
    circulation: 18000000,
    max: 21000000,
    volatility: 0.018, // bot effect per tick %
    minPrice: 5000,
    maxPrice: 60000,
  },
  LTC: {
    price: 70,
    circulation: 66000000,
    max: 84000000,
    volatility: 0.025,
    minPrice: 20,
    maxPrice: 250,
  }
};
const TICK_INTERVAL = 3500; // ms - market tick
const BOT_COUNT = 6; // bots trading per tick

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
  if (cost > state.usd) return log(`Insufficient USD to buy ${amt} ${coin}.`);
  if (amt > state.coins[coin].circulation) return log(`Not enough ${coin} in circulation to buy.`);

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

// --- Circulation Event ---
function checkCirculation(coin) {
  if (state.coins[coin].circulation <= 0) {
    state.coins[coin].circulation = 0;
    log(`!! All ${coin} have been bought out! Bots will drive prices up sharply until new coins are mined.`);
    // Simulate price spike
    state.coins[coin].price *= 1.05 + Math.random()*0.08;
    if (state.coins[coin].price > COINS[coin].maxPrice*2) state.coins[coin].price = COINS[coin].maxPrice*2;
    // "Mint" some new coins randomly after a few ticks
    setTimeout(() => {
      let mint = Math.floor(COINS[coin].max * 0.01 * Math.random());
      state.coins[coin].circulation += mint;
      log(`Miners released ${mint} new ${coin} into circulation.`);
      saveState();
      updateUI();
    }, 4000 + Math.random()*5000);
  }
}

// --- Bot Market Simulation ---
function botMarketTick() {
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
