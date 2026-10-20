// Extend this small policy list when another essential is introduced. Backpack
// order remains independent; quickbar keys always follow the displayed slots.
export const ESSENTIAL_QUICKBAR=Object.freeze(['flint','pyrite','log']);
export function quickbarOrder(order,inventory){
  const carried=[...new Set(order)].filter(k=>inventory[k]>0);
  const pinned=ESSENTIAL_QUICKBAR.filter(k=>inventory[k]>0);
  return [...pinned,...carried.filter(k=>!ESSENTIAL_QUICKBAR.includes(k))];
}
