// ASTRA GoldICTSMC v1 - rebuilt from user's 2025-08-14 email.
// Closed H1 break-of-structure, EMA50/200, ATR risk sizing, no lookahead.
#property strict
#property version "1.10"
#include <ASTRA_MT5_Common.mqh>
input ulong InpMagic=2026111203;
input double InpRiskPct=0.50;
input double InpDailyEquityLossPct=5.0;
input double InpMaxSpreadPoints=120.0;
input int InpStructureLookback=14;
input double InpStopATR=1.50;
input double InpRewardR=1.33;
CTrade trade;
int hEMA50=INVALID_HANDLE,hEMA200=INVALID_HANDLE,hATR=INVALID_HANDLE;
datetime lastH1=0,lastDay=0;
double dayEquity=0;
int OnInit()
{
   hEMA50=iMA(_Symbol,PERIOD_H1,50,0,MODE_EMA,PRICE_CLOSE);
   hEMA200=iMA(_Symbol,PERIOD_H1,200,0,MODE_EMA,PRICE_CLOSE);
   hATR=iATR(_Symbol,PERIOD_H1,14);
   if(hEMA50==INVALID_HANDLE||hEMA200==INVALID_HANDLE||hATR==INVALID_HANDLE)
      return INIT_FAILED;
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFillingBySymbol(_Symbol);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   IndicatorRelease(hEMA50);IndicatorRelease(hEMA200);IndicatorRelease(hATR);
}
void OnTick()
{
   AstraProtect(trade,InpMagic,hATR,1.0,1.0);
   if(AstraDailyRiskPause(lastDay,dayEquity,InpDailyEquityLossPct)) return;
   if(!AstraNewBar(PERIOD_H1,lastH1)) return;
   if(!AstraSpreadOK(InpMaxSpreadPoints) || AstraPositions(InpMagic)>0) return;
   if(Bars(_Symbol,PERIOD_H1)<InpStructureLookback+205) return;
   double e50,e200,atr;
   if(!AstraVal(hEMA50,1,e50)||!AstraVal(hEMA200,1,e200)||
      !AstraVal(hATR,1,atr)||atr<=0) return;
   // Important: structure reference excludes signal bar 1 and previous bar 2.
   // Levels are from bars 3..(lookback+2), never from a future bar.
   double priorHigh=-DBL_MAX,priorLow=DBL_MAX;
   double highPrev=-DBL_MAX,lowPrev=DBL_MAX;
   for(int s=3;s<InpStructureLookback+3;s++)
   {
      double high=iHigh(_Symbol,PERIOD_H1,s),low=iLow(_Symbol,PERIOD_H1,s);
      priorHigh=MathMax(priorHigh,high);
      priorLow=MathMin(priorLow,low);
   }
   for(int s=4;s<InpStructureLookback+4;s++)
   {
      highPrev=MathMax(highPrev,iHigh(_Symbol,PERIOD_H1,s));
      lowPrev=MathMin(lowPrev,iLow(_Symbol,PERIOD_H1,s));
   }
   double close1=iClose(_Symbol,PERIOD_H1,1);
   double close2=iClose(_Symbol,PERIOD_H1,2);
   bool buy=e50>e200 && close1>priorHigh && close2<=highPrev;
   bool sell=e50<e200 && close1<priorLow && close2>=lowPrev;
   if(buy)
      AstraEnter(trade,ORDER_TYPE_BUY,InpRiskPct,atr*InpStopATR,InpRewardR,"ASTRA ICT BOS BUY");
   else if(sell)
      AstraEnter(trade,ORDER_TYPE_SELL,InpRiskPct,atr*InpStopATR,InpRewardR,"ASTRA ICT BOS SELL");
}
