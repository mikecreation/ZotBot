// Simulation stays in Celsius; presentation consistently includes Fahrenheit.
export const fahrenheit=c=>Number(c)*9/5+32;
export function temperature(c,digits=1){const n=Number(c);return `${n.toFixed(digits)} °C / ${fahrenheit(n).toFixed(digits)} °F`}
export function temperatureDelta(c,digits=1){const n=Number(c);return `${n.toFixed(digits)} °C / ${(n*9/5).toFixed(digits)} °F`}
