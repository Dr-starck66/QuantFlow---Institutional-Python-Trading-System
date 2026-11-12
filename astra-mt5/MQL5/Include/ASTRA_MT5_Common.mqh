// ASTRA MT5 common risk/execution functions - research only.
// Never run on a funded account without native MetaEditor compilation and MT5 tester report.
#ifndef __ASTRA_MT5_COMMON_MQH__
#define __ASTRA_MT5_COMMON_MQH__
#include <Trade/Trade.mqh>

bool AstraVal(const int handle,const int shift,double &value)
{
   double out[1];
   if(handle==INVALID_HANDLE || CopyBuffer(handle,0,shift,1,out)!=1) return false;
   value=out[0];
   return MathIsValidNumber(value) && value!=EMPTY_VALUE;
}
bool AstraNewBar(const ENUM_TIMEFRAMES tf,datetime &last)
{
   datetime now=iTime(_Symbol,tf,0);
   if(now<=0 || now==last) return false;
   last=now;
   return true;
}
int AstraPositions(const ulong magic)
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol &&
         (ulong)PositionGetInteger(POSITION_MAGIC)==magic) count++;
   }
   return count;
}
bool AstraSpreadOK(const double maxPoints)
{
   MqlTick t;
   if(!SymbolInfoTick(_Symbol,t)) return false;
   double p=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   if(p<=0) return false;
   return (t.ask-t.bid)/p <= maxPoints;
}
// Equity based including unrealised P/L; blocks entries, not a prop-firm certification.
bool AstraDailyRiskPause(datetime &day,double &baseline,const double lossPct)
{
   datetime date=iTime(_Symbol,PERIOD_D1,0);
   if(date==0) return true;
   if(date!=day){day=date; baseline=AccountInfoDouble(ACCOUNT_EQUITY);}
   if(baseline<=0) return true;
   return AccountInfoDouble(ACCOUNT_EQUITY) <= baseline*(1.0-lossPct/100.0);
}
double AstraLots(const ENUM_ORDER_TYPE side,const double entry,
                 const double stop,const double riskPct)
{
   double pnl=0;
   if(!OrderCalcProfit(side,_Symbol,1.0,entry,stop,pnl) || pnl>=0) return 0;
   const double risk=AccountInfoDouble(ACCOUNT_EQUITY)*riskPct/100.0;
   const double minLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   const double maxLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   const double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(risk<=0 || step<=0 || minLot<=0 || maxLot<=0) return 0;
   double lots=MathFloor((risk/(-pnl))/step)*step;
   lots=MathMin(lots,maxLot);
   if(lots<minLot) return 0; // never round up beyond the risk cap
   return NormalizeDouble(lots,8);
}
bool AstraEnter(CTrade &order,const ENUM_ORDER_TYPE side,const double riskPct,
                const double stopDistance,const double rewardR,const string label)
{
   if(stopDistance<=0 || rewardR<=0) return false;
   MqlTick t;
   if(!SymbolInfoTick(_Symbol,t)) return false;
   double entry=(side==ORDER_TYPE_BUY?t.ask:t.bid);
   double stop=(side==ORDER_TYPE_BUY?entry-stopDistance:entry+stopDistance);
   double target=(side==ORDER_TYPE_BUY?entry+rewardR*stopDistance:entry-rewardR*stopDistance);
   double volume=AstraLots(side,entry,stop,riskPct);
   if(volume<=0) {Print("ASTRA: volume below broker minimum / risk cap");return false;}
   stop=NormalizeDouble(stop,_Digits);target=NormalizeDouble(target,_Digits);
   bool ok=(side==ORDER_TYPE_BUY)?
      order.Buy(volume,_Symbol,0.0,stop,target,label):
      order.Sell(volume,_Symbol,0.0,stop,target,label);
   if(!ok) Print("ASTRA: trade refused: ",order.ResultRetcodeDescription());
   return ok;
}
double AstraVWAP(const ENUM_TIMEFRAMES tf,const int lookback)
{
   double pv=0.0,vol=0.0;
   for(int s=1;s<=lookback;s++)
   {
      long v=iVolume(_Symbol,tf,s);
      if(v<=0) continue;
      double hi=iHigh(_Symbol,tf,s),lo=iLow(_Symbol,tf,s),cl=iClose(_Symbol,tf,s);
      if(hi<=0 || lo<=0 || cl<=0) return 0;
      pv+=((hi+lo+cl)/3.0)*(double)v; vol+=(double)v;
   }
   return vol>0 ? pv/vol : 0.0;
}
// Manage only matching MagicNumber and symbol; do not stop management at entry cap.
void AstraProtect(CTrade &order,const ulong magic,const int atrHandle,
                  const double breakEvenATR,const double trailATR)
{
   double atr;
   if(!AstraVal(atrHandle,1,atr) || atr<=0) return;
   MqlTick t;
   if(!SymbolInfoTick(_Symbol,t)) return;
   const double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   const int minDist=(int)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         (ulong)PositionGetInteger(POSITION_MAGIC)!=magic) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      double entry=PositionGetDouble(POSITION_PRICE_OPEN);
      double oldSL=PositionGetDouble(POSITION_SL);
      double tp=PositionGetDouble(POSITION_TP);
      double newSL=oldSL;
      if(type==POSITION_TYPE_BUY && t.bid-entry>=breakEvenATR*atr)
      {
         newSL=MathMax(newSL,entry);
         newSL=MathMax(newSL,t.bid-trailATR*atr);
         if(newSL>oldSL+pt && newSL<t.bid-(minDist+2)*pt)
            order.PositionModify(ticket,NormalizeDouble(newSL,_Digits),tp);
      }
      if(type==POSITION_TYPE_SELL && entry-t.ask>=breakEvenATR*atr)
      {
         if(newSL<=0) newSL=entry;
         newSL=MathMin(newSL,entry);
         newSL=MathMin(newSL,t.ask+trailATR*atr);
         if((oldSL<=0 || newSL<oldSL-pt) && newSL>t.ask+(minDist+2)*pt)
            order.PositionModify(ticket,NormalizeDouble(newSL,_Digits),tp);
      }
   }
}
#endif
