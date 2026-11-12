// ASTRA GoldATRRSIVWAP v1 - reconstructed from user's 2025-09-25 email.
// Risk based lot sizing; confirmed M5 bars; pyramiding only on hedging accounts.
#property strict
#property version "1.10"
#include <ASTRA_MT5_Common.mqh>
input ulong InpMagic=2026111202;
input double InpRiskPct=0.30;
input double InpDailyEquityLossPct=5.0;
input double InpMaxSpreadPoints=120.0;
input int InpMaxPositions=3;
input double InpStopATR=1.5;
input double InpRewardR=2.0;
input double InpPyramidStepATR=1.0;
CTrade trade;
int hRSI=INVALID_HANDLE,hATR=INVALID_HANDLE,hMA=INVALID_HANDLE;
datetime lastM5=0,lastDay=0;
double dayEquity=0;
int OnInit()
{
   hRSI=iRSI(_Symbol,PERIOD_M5,14,PRICE_CLOSE);
   hATR=iATR(_Symbol,PERIOD_M5,14);
   hMA=iMA(_Symbol,PERIOD_M5,200,0,MODE_SMA,PRICE_CLOSE);
   if(hRSI==INVALID_HANDLE || hATR==INVALID_HANDLE || hMA==INVALID_HANDLE)
      return INIT_FAILED;
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFillingBySymbol(_Symbol);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   IndicatorRelease(hRSI);IndicatorRelease(hATR);IndicatorRelease(hMA);
}
void OnTick()
{
   AstraProtect(trade,InpMagic,hATR,1.0,0.75);
   if(AstraDailyRiskPause(lastDay,dayEquity,InpDailyEquityLossPct)) return;
   if(!AstraNewBar(PERIOD_M5,lastM5)) return;
   if(!AstraSpreadOK(InpMaxSpreadPoints)) return;
   double atr1,atr2,atr3,rsi1,rsi2,ma1;
   if(!AstraVal(hATR,1,atr1)||!AstraVal(hATR,2,atr2)||
      !AstraVal(hATR,3,atr3)||!AstraVal(hRSI,1,rsi1)||
      !AstraVal(hRSI,2,rsi2)||!AstraVal(hMA,1,ma1)||atr1<=0) return;
   double atrSum=0.0,val=0;
   for(int k=1;k<=50;k++)
   {
      if(!AstraVal(hATR,k,val)) return;
      atrSum+=val;
   }
   const double atrAvg=atrSum/50.0;
   const double price=iClose(_Symbol,PERIOD_M5,1);
   const double vwap=AstraVWAP(PERIOD_M5,50);
   if(price<=0||vwap<=0) return;
   int count=AstraPositions(InpMagic);
   if(count>0)
   {
      // The original code bought each tick with no price step; fixed here.
      // Pyramiding on netting accounts is intentionally disabled.
      if((int)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING ||
         count>=InpMaxPositions) return;
      datetime newest=0;
      double lastEntry=0;
      long lastSide=-1;
      for(int i=PositionsTotal()-1;i>=0;i--)
      {
         ulong ticket=PositionGetTicket(i);
         if(ticket==0||PositionGetString(POSITION_SYMBOL)!=_Symbol||
            (ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
         datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
         if(opened>=newest)
         {
            newest=opened;
            lastEntry=PositionGetDouble(POSITION_PRICE_OPEN);
            lastSide=PositionGetInteger(POSITION_TYPE);
         }
      }
      if(lastEntry<=0 || atr1<=0) return;
      if(lastSide==POSITION_TYPE_BUY && price>=lastEntry+InpPyramidStepATR*atr1 &&
         price>vwap)
         AstraEnter(trade,ORDER_TYPE_BUY,InpRiskPct,atr1*InpStopATR,InpRewardR,"ASTRA VWAP ADD");
      else if(lastSide==POSITION_TYPE_SELL && price<=lastEntry-InpPyramidStepATR*atr1 &&
              price<vwap)
         AstraEnter(trade,ORDER_TYPE_SELL,InpRiskPct,atr1*InpStopATR,InpRewardR,"ASTRA VWAP ADD");
      return;
   }
   if(atr1<atrAvg || !(atr2<atr3 && atr1>atr2)) return;
   bool upward=(price>ma1 && iLow(_Symbol,PERIOD_M5,1)<iLow(_Symbol,PERIOD_M5,2) && rsi1>rsi2);
   bool downward=(price<ma1 && iHigh(_Symbol,PERIOD_M5,1)>iHigh(_Symbol,PERIOD_M5,2) && rsi1<rsi2);
   if(upward) AstraEnter(trade,ORDER_TYPE_BUY,InpRiskPct,atr1*InpStopATR,InpRewardR,"ASTRA RSI BUY");
   else if(downward) AstraEnter(trade,ORDER_TYPE_SELL,InpRiskPct,atr1*InpStopATR,InpRewardR,"ASTRA RSI SELL");
}
