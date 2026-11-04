const noop = () => null;
const asyncNoop = async () => null;
const sub = () => ({ remove() {} });
module.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? true : String(k).startsWith('use') ? noop : String(k).startsWith('add') ? sub : k === 'default' ? {} : asyncNoop) });
