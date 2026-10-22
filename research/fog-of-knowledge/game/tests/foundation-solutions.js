// Analytic inverse designs, independently chosen for each contract.
export function foundationSolution(id,s){switch(id){
case'bayes':{const p=[.01,.1,.5][s];return {guess:Math.round(1000*.9*p/(.9*p+.05*(1-p)))/10}}
case'sampling':return{n:[97,385,1537][s]};
case'confounding':return{design:1,estimate:[-5,-10,-15][s]};
case'energy':return{height:Math.round([8,12,16][s]**2/19.62*10)/10,loss:0};
case'carnot':return{hot:[200,400,600][s],cold:0};
case'diffusion':return{d:[.8,1.6,2.4][s],time:[10,20,30][s]};
case'osmosis':return{outside:[.2,.4,.6][s]};
case'feedback':return{gain:.2};
case'selection':{const p=[.5,.8,.95][s];return{fitness:Math.round((9*p/(1-p))**.1*100)/100}}
case'spread':return{reduction:[35,61,76][s]};
case'growth':return{time:Math.round(Math.log([2,4,8][s])/Math.log(1+[.05,.1,.2][s])*10)/10};
case'bits':return{p:[10,25,50][s]};
case'redundancy':return{code:[1,2,3][s]};
case'inverse':return{distance:[2,4,10][s]};
case'scaling':return{side:[2,4,8][s]};
case'carbon':return{emissions:[4,6,8][s]};
case'expected':return{choice:[0,1,0][s]};
case'replication':return{n:[2,3,4][s],independent:1};
}throw Error(id)}
