export const pythonCodebase: Record<string, { filename: string, description: string, code: string }> = {
  data_engine: {
    filename: "data_engine.py",
    description: "PHASE 1 — DATA ENGINE: Ingest tick-level bid/ask data, normalize into schema, and reconstruct aggregate bars.",
    code: `import pandas as pd
import numpy as np
import pyarrow.parquet as pq
from pathlib import Path
from typing import Union, Optional

class DataEngine:
    """
    Institutional Data Engine for Tick & Order Book Ingestion.
    Supports chunked loading of historical Dukascopy/broker tick data.
    """
    
    def __init__(self, data_dir: Union[str, Path]):
        self.data_dir = Path(data_dir)
        self.tick_schema = ['timestamp', 'bid', 'ask', 'volume']
        
    def load_parquet_ticks(self, file_name: str) -> pd.DataFrame:
        """Loads tick data from a Parquet file for highly efficient memory usage."""
        file_path = self.data_dir / file_name
        if not file_path.exists():
            raise FileNotFoundError(f"Tick file missing: {file_path}")
            
        table = pq.read_table(file_path)
        df = table.to_pandas()
        return self._normalize_ticks(df)

    def load_csv_ticks(self, file_name: str, chunk_size: int = 1000000) -> pd.DataFrame:
        """Loads ticks from CSV with chunking to handle millions of rows safely."""
        file_path = self.data_dir / file_name
        chunks = []
        
        for chunk in pd.read_csv(file_path, chunksize=chunk_size, parse_dates=['timestamp']):
            chunks.append(self._normalize_ticks(chunk))
            
        return pd.concat(chunks, ignore_index=True)

    def _normalize_ticks(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalizes raw ticks to the unified schema.
        Calculates mid_price and spread vectorially.
        """
        # Ensure schema matches
        for col in self.tick_schema:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
                
        df.set_index('timestamp', inplace=True)
        # Drop duplicates and sort to prevent temporal leaks
        df = df[~df.index.duplicated(keep='last')].sort_index()
        
        # Calculate derived basic series
        df['mid_price'] = (df['bid'] + df['ask']) / 2.0
        df['spread'] = df['ask'] - df['bid']
        
        # Filter anomalous negative spreads (bad broker ticks)
        df = df[df['spread'] >= 0]
        
        return df

    def aggregate_to_bars(self, df: pd.DataFrame, freq: str = '1min') -> pd.DataFrame:
        """Aggregates tick data into time-based internal bars for ML consumption."""
        bars = df['mid_price'].resample(freq).ohlc()
        bars['volume'] = df['volume'].resample(freq).sum()
        bars['tick_count'] = df['mid_price'].resample(freq).count()
        bars['mean_spread'] = df['spread'].resample(freq).mean()
        
        return bars.dropna()

if __name__ == "__main__":
    # Example Usage
    engine = DataEngine("./data")
    # ticks = engine.load_csv_ticks("XAUUSD_ticks_2024.csv")
    pass
`
  },
  order_flow: {
    filename: "order_flow_engine.py",
    description: "PHASE 2 — ORDER FLOW ENGINE: Microstructure features, delta volume, liquidity sweeps, structural breaks.",
    code: `import pandas as pd
import numpy as np

class OrderFlowEngine:
    """
    Computes market microstructure features on tick or ultra-low timeframe bar data.
    """
    
    def __init__(self):
        # Configuration for structural breaks
        self.swing_window = 20

    def compute_tick_delta(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Approximates aggressive order flow using the tick-test algorithm.
        Up-tick = Buy Volume | Down-tick = Sell Volume.
        """
        # Determine tick direction: 1 for up, -1 for down, 0 for flat
        price_diff = df['mid_price'].diff()
        tick_direction = np.sign(price_diff)
        
        # Forward fill flat ticks to assign them the direction of the last movement
        tick_direction = tick_direction.replace(0, np.nan).fillna(method='ffill')
        
        # Calculate signed volume (delta)
        df['delta_vol'] = df['volume'] * tick_direction
        df['cum_delta'] = df['delta_vol'].cumsum()
        
        return df

    def compute_imbalance_clusters(self, bars: pd.DataFrame, threshold: float = 3.0) -> pd.DataFrame:
        """
        Identifies order flow imbalance clusters (e.g. FVG - Fair Value Gaps).
        Requires OHLCV data.
        """
        bars['body_size'] = abs(bars['close'] - bars['open'])
        bars['avg_body'] = bars['body_size'].rolling(window=20).mean()
        
        # Imbalance is flagged when body size is > threshold * average body
        bars['is_imbalance'] = (bars['body_size'] > (bars['avg_body'] * threshold)).astype(int)
        
        # Direction of imbalance
        bars['imbalance_dir'] = np.where(bars['close'] > bars['open'], 1, -1) * bars['is_imbalance']
        
        return bars

    def detect_liquidity_sweeps(self, bars: pd.DataFrame, lookback: int = 50) -> pd.DataFrame:
        """
        Detects buy/sell absorption and liquidity sweeps using rolling highs/lows.
        """
        bars['rolling_high'] = bars['high'].rolling(window=lookback).max().shift(1)
        bars['rolling_low'] = bars['low'].rolling(window=lookback).min().shift(1)
        
        # Sweep High: price breaks rolling high but closes below it
        bars['sweep_high'] = ((bars['high'] > bars['rolling_high']) & (bars['close'] < bars['rolling_high'])).astype(int)
        
        # Sweep Low: price breaks rolling low but closes above it
        bars['sweep_low'] = ((bars['low'] < bars['rolling_low']) & (bars['close'] > bars['rolling_low'])).astype(int)
        
        return bars

    def detect_bos_choch(self, bars: pd.DataFrame) -> pd.DataFrame:
        """
        Detects Break of Structure (BOS) and Change of Character (CHoCH).
        """
        bars['swing_high'] = bars['high'].rolling(window=self.swing_window, center=True).max()
        bars['swing_low'] = bars['low'].rolling(window=self.swing_window, center=True).min()
        
        # Simplified BOS logic: Close above recent swing high
        # In a real system, this involves complex zig-zag/fractal traversal.
        bars['bos_bullish'] = (bars['close'] > bars['swing_high'].shift(1)).astype(int)
        bars['bos_bearish'] = (bars['close'] < bars['swing_low'].shift(1)).astype(int)
        
        return bars

    def extract_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Master method to compute all order flow features into a vector."""
        if 'open' not in df.columns:
            # It's tick data, do tick delta
            df = self.compute_tick_delta(df)
        else:
            # It's bar data
            df = self.compute_imbalance_clusters(df)
            df = self.detect_liquidity_sweeps(df)
            df = self.detect_bos_choch(df)
            
        return df
`
  },
  regime_detection: {
    filename: "regime_detection.py",
    description: "PHASE 3 — REGIME DETECTION: Detect trend, range, volatility states using ATR and rolling correlations.",
    code: `import pandas as pd
import numpy as np

class RegimeDetector:
    """
    Detects the current market regime based on volatility, momentum, and cross-asset correlation.
    """
    
    def __init__(self, atr_period: int = 14, corr_window: int = 60):
        self.atr_period = atr_period
        self.corr_window = corr_window
        
    def add_atr(self, df: pd.DataFrame) -> pd.DataFrame:
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = np.max(ranges, axis=1)
        
        df['atr'] = true_range.rolling(self.atr_period).mean()
        df['atr_percentile'] = df['atr'].rolling(200).apply(lambda x: pd.Series(x).rank(pct=True).iloc[-1])
        return df

    def add_rolling_correlation(self, target_asset: pd.Series, macro_asset: pd.Series) -> pd.Series:
        """
        Example: Correlate XAUUSD with DXY or US10Y.
        """
        return target_asset.rolling(self.corr_window).corr(macro_asset)

    def detect_regime(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Classifies the regime into states:
        0 = Range / Low Vol
        1 = Trend Formulation / Expanding Vol
        2 = High Volatility / News Driven
        3 = Liquidity Void / Exhaustion
        """
        df = self.add_atr(df)
        
        # Compute volume moving average
        df['vol_ma'] = df['volume'].rolling(50).mean()
        df['vol_expansion'] = df['volume'] > (df['vol_ma'] * 1.5)
        
        # Trend ADX approx using short vs long term EMA distance
        ema_short = df['close'].ewm(span=20).mean()
        ema_long = df['close'].ewm(span=50).mean()
        df['trend_strength'] = abs(ema_short - ema_long) / ema_long
        df['trend_strength_pct'] = df['trend_strength'].rolling(200).apply(lambda x: pd.Series(x).rank(pct=True).iloc[-1])
        
        # Label Rules Let's define the labels
        conditions = [
            (df['atr_percentile'] > 0.8) & (df['vol_expansion']), # High Vol / News
            (df['trend_strength_pct'] > 0.7) & (df['atr_percentile'] > 0.4), # Trending
            (df['trend_strength_pct'] < 0.3) & (df['atr_percentile'] < 0.5), # Ranging
        ]
        choices = ['High_Vol', 'Trend', 'Range']
        
        df['regime_label'] = np.select(conditions, choices, default='Transition')
        
        # Confidence score (simplified heuristic)
        df['regime_confidence'] = (df['atr_percentile'] + df['trend_strength_pct']) / 2.0
        
        return df
`
  },
  ml_engine: {
    filename: "ml_stack.py",
    description: "PHASE 4 — MACHINE LEARNING STACK: Ensemble of XGBoost classifier and PyTorch LSTM neural network.",
    code: `import pandas as pd
import numpy as np
import xgboost as xgb
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler
from typing import Tuple

# ----------------------------
# MODEL A: XGBClassifier
# ----------------------------
class XGBoostModel:
    def __init__(self):
        self.model = xgb.XGBClassifier(
            n_estimators=500,
            learning_rate=0.01,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )
        
    def train(self, X_train: pd.DataFrame, y_train: pd.Series):
        self.model.fit(X_train, y_train)
        
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(X)[:, 1] # Probability of Class 1


# ----------------------------
# MODEL B: PyTorch LSTM
# ----------------------------
class OrderFlowLSTM(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 64, num_layers: int = 2):
        super(OrderFlowLSTM, self).__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_dim, 1)
        self.sigmoid = nn.Sigmoid()
        
    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :]) # Take last sequence step
        return self.sigmoid(out)

class LSTMSequentialModel:
    def __init__(self, input_dim: int, seq_length: int = 30):
        self.seq_length = seq_length
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = OrderFlowLSTM(input_dim).to(self.device)
        self.scaler = StandardScaler()
        
    def create_sequences(self, data: np.ndarray) -> np.ndarray:
        sequences = []
        for i in range(len(data) - self.seq_length):
            sequences.append(data[i:i+self.seq_length])
        return np.array(sequences)
        
    def predict_proba(self, X_seq: np.ndarray) -> np.ndarray:
        self.model.eval()
        with torch.no_grad():
            x_tensor = torch.FloatTensor(X_seq).to(self.device)
            preds = self.model(x_tensor).cpu().numpy()
        return preds.flatten()


# ----------------------------
# ENSEMBLE ENGINE
# ----------------------------
class MLEnsemble:
    """Ensembles the XGBoost and LSTM predictions."""
    def __init__(self, xgb_weight: float = 0.6, lstm_weight: float = 0.4):
        self.xgb_weight = xgb_weight
        self.lstm_weight = lstm_weight
        self.xgb = XGBoostModel()
        self.lstm = None # Re-initialized when input_dim is known
        
    def compute_ensemble_signal(self, prob_xgb: np.ndarray, prob_lstm: np.ndarray) -> np.ndarray:
        """Returns the final ensembled probability."""
        return (prob_xgb * self.xgb_weight) + (prob_lstm * self.lstm_weight)
`
  },
  risk_engine: {
    filename: "risk_engine.py",
    description: "PHASE 5 — RISK MANAGEMENT: Institutional risk controls, max drawdown killswitch, ATR sizing.",
    code: `import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RiskEngine")

class RiskManagementEngine:
    """
    Enforces risk constraints on all generated signals prior to execution.
    """
    
    def __init__(self, 
                 initial_capital: float = 100000.0,
                 max_drawdown_pct: float = 0.15,
                 max_risk_per_trade_pct: float = 0.01,
                 max_open_positions: int = 3):
        self.capital = initial_capital
        self.peak_capital = initial_capital
        
        self.max_drawdown_pct = max_drawdown_pct
        self.max_risk_per_trade_pct = max_risk_per_trade_pct
        self.max_open_positions = max_open_positions
        
        self.kill_switch_active = False

    def update_capital(self, current_equity: float):
        self.capital = current_equity
        if self.capital > self.peak_capital:
            self.peak_capital = self.capital
            
        current_drawdown = (self.peak_capital - self.capital) / self.peak_capital
        if current_drawdown >= self.max_drawdown_pct:
            logger.critical(f"HARD KILL SWITCH ACTIVATED. System Drawdown: {current_drawdown*100:.2f}%")
            self.kill_switch_active = True

    def calculate_position_size(self, entry_price: float, stop_loss: float, currency_multiplier: float = 1.0) -> float:
        """
        Volatility-adjusted position sizing using Risk Amount / Stop Loss Distance.
        """
        if self.kill_switch_active:
            return 0.0
            
        risk_amount = self.capital * self.max_risk_per_trade_pct
        price_risk = abs(entry_price - stop_loss) * currency_multiplier
        
        if price_risk == 0:
            return 0.0
            
        # Example for MT5 standard lots where 1 lot = 100,000 units
        position_size = risk_amount / price_risk
        
        # Round to nearest micro lot
        return round(position_size, 2)

    def validate_trade(self, regime_label: str, confidence: float, open_positions_count: int) -> bool:
        """
        Filters trades based on active market regime and portfolio state.
        """
        if self.kill_switch_active:
            logger.error("Trade blocked: Kill switch is active.")
            return False
            
        if open_positions_count >= self.max_open_positions:
            logger.warning(f"Trade blocked: Max open positions ({self.max_open_positions}) reached.")
            return False
            
        # Prevent trading in high volatility unpredictable news spikes unless confidence is absolute
        if regime_label == 'High_Vol' and confidence < 0.85:
            logger.warning(f"Trade blocked: High Volatility regime with insufficient confidence ({confidence}).")
            return False
            
        return True
`
  },
  execution: {
    filename: "execution_engine.py",
    description: "PHASE 6 — EXECUTION ENGINE: Connects to MetaTrader 5 API for live execution and portfolio sync.",
    code: `import time
import logging
from typing import Optional, Dict

# Attempt to import MT5; fail gracefully if not in a Windows MT5 environment
try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

logger = logging.getLogger("ExecutionEngine")

class MT5ExecutionEngine:
    """
    Handles live order execution to the MetaTrader 5 Terminal.
    Implements retries, slippage control, and SL/TP management.
    """
    
    def __init__(self, magic_number: int = 123456, max_retries: int = 3):
        self.magic_number = magic_number
        self.max_retries = max_retries
        self.connected = False

    def connect(self, login: int, password: str, server: str) -> bool:
        if mt5 is None:
            logger.error("MetaTrader5 package not installed. Execution disabled.")
            return False
            
        if not mt5.initialize(login=login, password=password, server=server):
            logger.error(f"MT5 initialize() failed, error code = {mt5.last_error()}")
            return False
            
        self.connected = True
        logger.info(f"Connected to MT5 Server: {server} Account: {login}")
        return True

    def place_order(self, symbol: str, is_buy: bool, volume: float, price: float, 
                    sl: float, tp: float, slippage: int = 10) -> Optional[Dict]:
        """
        Places a market order with retry logic for institutional reliability.
        """
        if not self.connected:
            return None
            
        action = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(volume),
            "type": action,
            "price": price,
            "sl": float(sl),
            "tp": float(tp),
            "deviation": slippage,
            "magic": self.magic_number,
            "comment": "QuantFlow Algo",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        for attempt in range(self.max_retries):
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                logger.warning(f"Order failed, code={result.retcode}. Retrying {attempt+1}/{self.max_retries}")
                time.sleep(1)
            else:
                logger.info(f"Order filled. Ticket: {result.order}, Price: {result.price}, Vol: {result.volume}")
                return result._asdict()
                
        logger.error(f"Failed to place order after {self.max_retries} attempts.")
        return None

    def close_all_positions(self, symbol: Optional[str] = None):
        """Emergency method to flatten the book."""
        if not self.connected: return
        
        positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
        if positions is None:
            return
            
        for pos in positions:
            is_buy = pos.type == mt5.ORDER_TYPE_BUY
            close_action = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
            price = mt5.symbol_info_tick(pos.symbol).bid if is_buy else mt5.symbol_info_tick(pos.symbol).ask
            
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "position": pos.ticket,
                "symbol": pos.symbol,
                "volume": pos.volume,
                "type": close_action,
                "price": price,
                "magic": self.magic_number,
                "comment": "Flatten Book",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            mt5.order_send(req)
`
  },
  backtest: {
    filename: "backtester.py",
    description: "PHASE 7 — BACKTEST ENGINE: Fast vectorized backtesting over ML signals with risk integration.",
    code: `import pandas as pd
import numpy as np

class VectorizedBacktester:
    """
    Simulates the ML predictions and generates performance metrics.
    Vectorized for high performance on millions of ticks/bars.
    """
    
    def __init__(self, initial_capital: float = 100000.0, transaction_cost: float = 0.0001):
        self.capital = initial_capital
        self.tc = transaction_cost
        
    def run(self, df: pd.DataFrame, signal_col: str = 'ml_signal', price_col: str = 'close'):
        """
        Runs the simulation. 
        signal_col expects 1 (buy), -1 (sell), 0 (hold).
        """
        # Calculate continuously compounded returns of the underlying asset
        df['returns'] = np.log(df[price_col] / df[price_col].shift(1))
        
        # Strategy returns (shifting signal by 1 to prevent lookahead bias)
        # Assuming we trade at the open of the next bar based on this bar's signal
        df['strategy_returns'] = df[signal_col].shift(1) * df['returns']
        
        # Account for transaction costs when signal changes
        df['trades'] = df[signal_col].diff().abs()
        df.loc[df['trades'] > 0, 'strategy_returns'] -= self.tc
        
        # Calculate cumulative metrics
        df['cum_returns'] = df['strategy_returns'].cumsum().apply(np.exp)
        df['equity_curve'] = self.capital * df['cum_returns']
        
        # Drawdown calculation
        df['rolling_max'] = df['equity_curve'].cummax()
        df['drawdown'] = (df['equity_curve'] - df['rolling_max']) / df['rolling_max']
        
        return self._generate_report(df)

    def _generate_report(self, df: pd.DataFrame) -> dict:
        total_return = df['cum_returns'].iloc[-1] - 1.0
        max_dd = df['drawdown'].min()
        
        # Annualized Sharpe (assuming 252*24 hours if hourly data, needs scaling based on timeframe)
        # Using simplified Sharpe here
        mean_ret = df['strategy_returns'].mean()
        std_ret = df['strategy_returns'].std()
        sharpe = (mean_ret / std_ret) * np.sqrt(252 * 24) if std_ret != 0 else 0
        
        return {
            "Total Return (%)": round(total_return * 100, 2),
            "Max Drawdown (%)": round(max_dd * 100, 2),
            "Sharpe Ratio": round(sharpe, 2),
            "Total Trades": int(df['trades'].sum() / 2)
        }
`
  },
  main: {
    filename: "main.py",
    description: "ENTRY POINT: Orchestrates data ingestion, inference, risk checking, and execution.",
    code: `import time
import logging
from data_engine import DataEngine
from order_flow_engine import OrderFlowEngine
from regime_detection import RegimeDetector
from ml_stack import MLEnsemble
from risk_engine import RiskManagementEngine
from execution_engine import MT5ExecutionEngine

logging.basicConfig(level=logging.INFO)

def main_live_loop():
    logger = logging.getLogger("MainLoop")
    logger.info("Initializing QuantFlow Institutional System...")
    
    # 1. Initialize Components
    data_engine = DataEngine("./data")
    of_engine = OrderFlowEngine()
    regime_detector = RegimeDetector()
    ml_ensemble = MLEnsemble() # Weights defined internally
    risk_engine = RiskManagementEngine(initial_capital=100000)
    exec_engine = MT5ExecutionEngine()
    
    # exec_engine.connect(12345, "password", "Broker-Live")
    
    logger.info("System Ready. Listening for ticks...")
    
    try:
        while True:
            # 1. Fetch real-time tick (Mocked here)
            # In production this is event-driven via MT5 OnTick() or ZeroMQ 
            current_bar = data_engine.get_latest_bar("XAUUSD") 
            if current_bar is None:
                time.sleep(0.1)
                continue
                
            # 2. Extract Microstructure Features
            features = of_engine.extract_features(current_bar)
            
            # 3. Detect Regime
            regime = regime_detector.detect_regime(features)
            regime_label = regime['regime_label'].iloc[-1]
            regime_conf = regime['regime_confidence'].iloc[-1]
            
            # 4. ML Inference
            # Mock arrays for prediction
            x_step = features.iloc[-1:].values
            x_seq = features.iloc[-30:].values 
            
            # prob_xgb = ml_ensemble.xgb.predict_proba(x_step)
            # prob_lstm = ml_ensemble.lstm.predict_proba(x_seq)
            # final_prob = ml_ensemble.compute_ensemble_signal(prob_xgb, prob_lstm)
            final_prob = 0.72 # Mock output
            
            # 5. Risk Management & Logic Pipeline
            if final_prob > 0.70:
                is_buy = True
            elif final_prob < 0.30:
                is_buy = False
            else:
                continue # Hold state
            
            # 6. Execution
            if risk_engine.validate_trade(regime_label, regime_conf, open_positions_count=0):
                # Calculate SL/TP
                entry = current_bar['mid_price'].iloc[-1]
                atr = regime['atr'].iloc[-1]
                
                sl = entry - (1.5 * atr) if is_buy else entry + (1.5 * atr)
                tp = entry + (3.0 * atr) if is_buy else entry - (3.0 * atr)
                
                size = risk_engine.calculate_position_size(entry, sl, currency_multiplier=1.0)
                
                # exec_engine.place_order("XAUUSD", is_buy, size, entry, sl, tp)
                logger.info(f"Signal executed: {'BUY' if is_buy else 'SELL'} @ {entry}")
            
            time.sleep(1) # Live loop cooldown
            
    except KeyboardInterrupt:
        logger.info("System shutting down. Flattening book...")
        # exec_engine.close_all_positions()

if __name__ == "__main__":
    main_live_loop()
`
  }
};
