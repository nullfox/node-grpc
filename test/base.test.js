import test from 'ava';
import Base from '../src/base';

test('Date property exists on instanciation of Base', (t) => {
  const base = new Base();

  t.true(base.date instanceof Date);
});
