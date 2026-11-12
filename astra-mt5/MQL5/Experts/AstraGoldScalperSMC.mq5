// ASTRA GoldScalperSMC v1 - rebuilt from user's 2025-09-24 emailed concept.
// XAUUSD / M5; trade entries only on completed bars; forward test before capital.
#property strict
#property version "1.10"
#include <ASTRA_MT5_Common.mqh>
input ulong InpMagic=2026111201;
input double InpRiskPct=0.30;
input double InpDailyEquityLossPct=5.0;
input double InpMaxSpreadPoints=120.0;
input int InpMaxPositions=2;
input double InpMinTrendATR=0.30;
input int InpMinSMCConfirmations=1;
input double InpStopATR=1.50;
input double InpRewardR=1.80;
CTrade trade;
int hH4fast=INVALID_HANDLE,hH4slow=INVALID_HANDLE,hH4atr=INVALID_HANDLE;
int hH1ema=INVALID_HANDLE,hM5ema=INVALID_HANDLE,hM5rsi=INVALID_HANDLE,hM5atr=INVALID_HANDLE;
datetime lastM5=0,lastDay=0;
double dayEquity=0;
int OnInit()
{
   hH4fast=iMA(_Symbol,PERIOD_H4,50,0,MODE_EMA,PRICE_CLOSE);
   hH4slow=iMA(_Symbol,PERIOD_H4,100,0,MODE_EMA,PRICE_CLOSE);
   hH4atr=iATR(_Symbol,PERIOD_H4,14);
   hH1ema=iMA(_Symbol,PERIOD_H1,20,0,MODE_EMA,PRICE_CLOSE);
   hM5ema=iMA(_Symbol,PERIOD_M5,34,0,MODE_EMA,PRICE_CLOSE);
   hM5rsi=iRSI(_Symbol,PERIOD_M5,11,PRICE_CLOSE);
   hM5atr=iATR(_Symbol,PERIOD_M5,14);
   if(hH4fast==INVALID_HANDLE || hH4slow==INVALID_HANDLE || hH4atr==INVALID_HANDLE ||
      hH1ema==INVALID_HANDLE || hM5ema==INVALID_HANDLE || hM5rsi==INVALID_HANDLE ||
      hM5atr==INVALID_HANDLE) return INIT_FAILED;
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFillingBySymbol(_Symbol);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   IndicatorRelease(hH4fast);IndicatorRelease(hH4slow);IndicatorRelease(hH4atr);
   IndicatorRelease(hH1ema);IndicatorRelease(hM5ema);IndicatorRelease(hM5rsi);
   IndicatorRelease(hM5atr);
}
int SMCScore(const bool bullish)
{
   // Completed M5 bars only (shift 1..4); no future peeking.
   double hi1=iHigh(_Symbol,PERIOD_M5,1),hi3=iHigh(_Symbol,PERIOD_M5,3);
   double lo1=iLow(_Symbol,PERIOD_M5,1),lo3=iLow(_Symbol,PERIOD_M5,3);
   double c1=iClose(_Symbol,PERIOD_M5,1),c2=iClose(_Symbol,PERIOD_M5,2);
   double o1=iOpen(_Symbol,PERIOD_M5,1),o2=iOpen(_Symbol,PERIOD_M5,2);
   double l2=iLow(_Symbol,PERIOD_M5,2),h2=iHigh(_Symbol,PERIOD_M5,2);
   int score=0;
   if(bullish)
   {
      if(lo1>hi3) score++; // upward FVG
      if(c2<o2 && c1>o1) score++; // reversal / order-block proxy
      if(l2<lo3 && c2>lo3) score++; // liquidity-sweep proxy
   }
   else
   {
      if(hi1<lo3) score++;
      if(c2>o2 && c1<o1) score++;
      if(h2>hi3 && c2<hi3) score++;
   }
   return score;
}
void OnTick()
{
   // IMPORTANT: protection always runs, even if spread/risk/position gate blocks entries.
   AstraProtect(trade,InpMagic,hM5atr,1.0,1.0);
   if(AstraDailyRiskPause(lastDay,dayEquity,InpDailyEquityLossPct)) return;
   if(!AstraNewBar(PERIOD_M5,lastM5)) return;
   if(!AstraSpreadOK(InpMaxSpreadPoints) || AstraPositions(InpMagic)>=InpMaxPositions) return;
   double h4fast,h4slow,h4atr,h1ema,m5ema,m5rsi,m5atr;
   if(!AstraVal(hH4fast,1,h4fast)||!AstraVal(hH4slow,1,h4slow)||
      !AstraVal(hH4atr,1,h4atr)||!AstraVal(hH1ema,1,h1ema)||
      !AstraVal(hM5ema,1,m5ema)||!AstraVal(hM5rsi,1,m5rsi)||
      !AstraVal(hM5atr,1,m5atr)||h4atr<=0||m5atr<=0) return;
   double trendStrength=MathAbs(h4fast-h4slow)/h4atr; // dimensionless, unlike the original 0.3 bug
   if(trendStrength<InpMinTrendATR) return;
   const double price=iClose(_Symbol,PERIOD_M5,1);
   const double vwap=AstraVWAP(PERIOD_M5,50);
   if(price<=0 || vwap<=0) return;
   bool bull=(h4fast>h4slow && price>h1ema && price>m5ema && price>vwap &&
              m5rsi>=35 && m5rsi<=65);
   bool bear=(h4fast<h4slow && price<h1ema && price<m5ema && price<vwap &&
              m5rsi>=35 && m5rsi<=65);
   if(bull && SMCScore(true)>=InpMinSMCConfirmations)
      AstraEnter(trade,ORDER_TYPE_BUY,InpRiskPct,m5atr*InpStopATR,InpRewardR,"ASTRA SMC BUY");
   else if(bear && SMCScore(false)>=InpMinSMCConfirmations)
      AstraEnter(trade,ORDER_TYPE_SELL,InpRiskPct,m5atr*InpStopATR,InpRewardR,"ASTRA SMC SELL");
}
