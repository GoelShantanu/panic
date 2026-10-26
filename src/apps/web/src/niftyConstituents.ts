// Official NSE Nifty 50 and Nifty 100 Constituent Sets
// Maintained according to official NSE Indices methodology (niftyindices.com)

export const NIFTY_50_SYMBOLS: ReadonlySet<string> = new Set([
  'ADANIENT',
  'ADANIPORTS',
  'APOLLOHOSP',
  'ASIANPAINT',
  'AXISBANK',
  'BAJAJ-AUTO',
  'BAJAJ_AUTO',
  'BAJFINANCE',
  'BAJAJFINSV',
  'BEL',
  'BPCL',
  'BHARTIARTL',
  'BRITANNIA',
  'CIPLA',
  'COALINDIA',
  'DRREDDY',
  'EICHERMOT',
  'GRASIM',
  'HCLTECH',
  'HDFCBANK',
  'HDFCLIFE',
  'HEROMOTOCO',
  'HINDALCO',
  'HINDUNILVR',
  'ICICIBANK',
  'ITC',
  'INDUSINDBK',
  'INFY',
  'JSWSTEEL',
  'KOTAKBANK',
  'LT',
  'M&M',
  'MARUTI',
  'NTPC',
  'NESTLEIND',
  'ONGC',
  'POWERGRID',
  'RELIANCE',
  'SBILIFE',
  'SHRIRAMFIN',
  'SBIN',
  'SUNPHARMA',
  'TCS',
  'TATACONSUM',
  'TATAMOTORS',
  'TMCV',
  'TATASTEEL',
  'TECHM',
  'TITAN',
  'TRENT',
  'ULTRACEMCO',
  'WIPRO',
]);

export const NIFTY_NEXT_50_SYMBOLS: ReadonlySet<string> = new Set([
  'ABB',
  'AMBUJACEM',
  'BANKBARODA',
  'BERGEPAINT',
  'BHEL',
  'BOSCHLTD',
  'CANBK',
  'CGPOWER',
  'CHOLAFIN',
  'COLPAL',
  'CUMMINSIND',
  'DABUR',
  'DIVISLAB',
  'DLF',
  'DMART',
  'GAIL',
  'GODREJCP',
  'HAL',
  'HAVELLS',
  'HINDZINC',
  'ICICIGI',
  'ICICIPRULI',
  'IDEA',
  'INDIGO',
  'IOC',
  'IRCTC',
  'JINDALSTEL',
  'JIOFIN',
  'LTIM',
  'LICI',
  'MARICO',
  'MOTHERSON',
  'NAUKRI',
  'OFSS',
  'PERSISTENT',
  'PIDILITIND',
  'PNB',
  'POLYCAB',
  'PFC',
  'RECLTD',
  'SAIL',
  'SBICARD',
  'SIEMENS',
  'SRF',
  'SUZLON',
  'TATAPOWER',
  'TORNTPHARM',
  'TVSMOTOR',
  'VEDL',
  'ZYDUSLIFE',
]);

export const NIFTY_100_SYMBOLS: ReadonlySet<string> = new Set([
  ...NIFTY_50_SYMBOLS,
  ...NIFTY_NEXT_50_SYMBOLS,
]);

export function isOfficialNifty50(symbol: string): boolean {
  const clean = symbol.trim().toUpperCase().replace(/^NSE:/, '');
  if (NIFTY_50_SYMBOLS.has(clean)) return true;
  if (clean === 'BAJAJ_AUTO' || clean === 'BAJAJ-AUTO') return true;
  if (clean === 'TMCV' || clean === 'TATAMOTORS') return true;
  return false;
}

export function isOfficialNifty100(symbol: string): boolean {
  const clean = symbol.trim().toUpperCase().replace(/^NSE:/, '');
  if (NIFTY_100_SYMBOLS.has(clean)) return true;
  if (clean === 'BAJAJ_AUTO' || clean === 'BAJAJ-AUTO') return true;
  if (clean === 'TMCV' || clean === 'TATAMOTORS') return true;
  return false;
}
