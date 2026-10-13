// The price lists, made in code: twelve for the examples, ten for the tasks. No vendor here is a real one.
const NAMES = ['Acme Desk', 'Borealis', 'Cygnus Flow', 'Dorado', 'Estuary', 'Fennel HQ', 'Gable', 'Heronry', 'Inkwell', 'Juno Board', 'Kelp', 'Lumen Path'];
const PRICE = [8, 9, 11, 12, 14, 15, 17, 19, 21, 24]; const MIN = [1, 5, 10, 20, 25, 40, 50];
const TEAM = [6, 12, 18, 30, 45, 8, 22, 60, 15, 35, 9];
const cost = (v, team) => v.price * Math.max(team, v.min);
function caseAt(i) {
  for (let salt = 0; ; salt += 1) {
    const vendors = [0, 1, 2].map((k) => ({ name: NAMES[(i * 3 + k * 5 + salt) % NAMES.length], price: PRICE[(i * 7 + k * 3 + salt) % PRICE.length], min: MIN[(i * 5 + k * 2 + salt * 3) % MIN.length] }));
    const team = TEAM[i % TEAM.length]; const costs = vendors.map((v) => cost(v, team)).sort((a, b) => a - b);
    // three different vendors, and one that plainly costs least
    if (new Set(vendors.map((v) => v.name)).size === 3 && costs[0] < costs[1]) return { vendors, team };
  }
}
export const sheets = Array.from({ length: 22 }, (_, i) => ({ id: i < 12 ? `e${String(i + 1).padStart(2, '0')}` : `t${i - 12}`, ...caseAt(i) }));
export const costOf = cost;
export const requestFor = (s) => `Compare these vendors on price for a team of ${s.team} people.`;
export const sheetText = (s) => `PRICE LIST (per month, billed monthly)\n${s.vendors.map((v) => `${v.name}: ${v.price} dollars per seat, minimum ${v.min} seat${v.min === 1 ? '' : 's'}`).join('\n')}\n`;
