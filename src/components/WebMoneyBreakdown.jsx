import {signedMoney} from '../domain/webPayment.mjs';
export default function WebMoneyBreakdown({monetary}){
 if(!monetary?.roundingCents)return null;
 return <small className="web-money-breakdown"><span>Subtotal: ${(monetary.calculatedCents/100).toFixed(2)}</span><span>Redondeo de efectivo: {signedMoney(monetary.roundingCents)}</span></small>;
}
