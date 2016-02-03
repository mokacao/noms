// @flow

import {assert} from 'chai';
import {suite} from 'mocha';

import MemoryStore from './memory_store.js';
import test from './async_test.js';
import type {ChunkStore} from './chunk_store.js';
import {Kind} from './noms_kind.js';
import {flatten} from './test_util.js';
import {makeCompoundType, makePrimitiveType} from './type.js';
import {MapLeafSequence, newMap, NomsMap} from './map.js';
import {MetaTuple, OrderedMetaSequence} from './meta_sequence.js';
import {writeValue} from './encode.js';

suite('BuildMap', () => {
  test('set of n numbers', async () => {
    const ms = new MemoryStore();
    const kvs = [];
    for (let i = 0; i < 10000; i++) {
      kvs.push(i, i + 1);
    }

    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.Int64),
                                makePrimitiveType(Kind.Int64));
    const m = await newMap(ms, tr, kvs);
    assert.strictEqual(m.ref.toString(), 'sha1-87b4686ae92df37f87f19b0264cbf24a21a5850e');

    // shuffle kvs, and test that the constructor sorts properly
    const pairs = [];
    for (let i = 0; i < kvs.length; i += 2) {
      pairs.push({k: kvs[i], v: kvs[i + 1]});
    }
    pairs.sort(() => Math.random() > .5 ? 1 : -1);
    kvs.length = 0;
    pairs.forEach(kv => kvs.push(kv.k, kv.v));
    const m2 = await newMap(ms, tr, kvs);
    assert.strictEqual(m2.ref.toString(), 'sha1-87b4686ae92df37f87f19b0264cbf24a21a5850e');
  });

  test('set', async () => {
    const ms = new MemoryStore();
    const kvs = [];
    for (let i = 0; i < 9990; i++) {
      kvs.push(i, i + 1);
    }

    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.Int64),
                                makePrimitiveType(Kind.Int64));
    let m = await newMap(ms, tr, kvs);
    for (let i = 9990; i < 10000; i++) {
      m = await m.set(i, i + 1);
    }

    assert.strictEqual(m.ref.toString(), 'sha1-87b4686ae92df37f87f19b0264cbf24a21a5850e');
  });

  test('set existing', async () => {
    const ms = new MemoryStore();
    const kvs = [];
    for (let i = 0; i < 10000; i++) {
      kvs.push(i, i + 1);
    }

    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.Int64),
                                makePrimitiveType(Kind.Int64));
    let m = await newMap(ms, tr, kvs);
    for (let i = 0; i < 10000; i++) {
      m = await m.set(i, i + 1);
    }

    assert.strictEqual(m.ref.toString(), 'sha1-87b4686ae92df37f87f19b0264cbf24a21a5850e');
  });

  test('remove', async () => {
    const ms = new MemoryStore();
    const kvs = [];
    for (let i = 0; i < 10010; i++) {
      kvs.push(i, i + 1);
    }

    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.Int64),
                                makePrimitiveType(Kind.Int64));
    let m = await newMap(ms, tr, kvs);
    for (let i = 10000; i < 10010; i++) {
      m = await m.remove(i);
    }

    assert.strictEqual(m.ref.toString(), 'sha1-87b4686ae92df37f87f19b0264cbf24a21a5850e');
  });
});

suite('MapLeaf', () => {
  test('isEmpty', () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Bool));
    const newMap = entries => new NomsMap(ms, tr, new MapLeafSequence(tr, entries));
    assert.isTrue(newMap([]).isEmpty());
    assert.isFalse(newMap([{key: 'a', value: false}, {key:'k', value:true}]).isEmpty());
  });

  test('has', async () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Bool));
    const m = new NomsMap(ms, tr,
        new MapLeafSequence(tr, [{key: 'a', value: false}, {key:'k', value:true}]));
    assert.isTrue(await m.has('a'));
    assert.isFalse(await m.has('b'));
    assert.isTrue(await m.has('k'));
    assert.isFalse(await m.has('z'));
  });

  test('first/get', async () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Int32));
    const m = new NomsMap(ms, tr,
                          new MapLeafSequence(tr, [{key: 'a', value: 4}, {key:'k', value:8}]));

    assert.deepEqual(['a', 4], await m.first());

    assert.strictEqual(4, await m.get('a'));
    assert.strictEqual(undefined, await m.get('b'));
    assert.strictEqual(8, await m.get('k'));
    assert.strictEqual(undefined, await m.get('z'));
  });

  test('forEach', async () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Int32));
    const m = new NomsMap(ms, tr,
                          new MapLeafSequence(tr, [{key: 'a', value: 4}, {key:'k', value:8}]));

    const kv = [];
    await m.forEach((v, k) => { kv.push(k, v); });
    assert.deepEqual(['a', 4, 'k', 8], kv);
  });

  test('iterator', async () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Int32));

    const test = async entries => {
      const m = new NomsMap(ms, tr, new MapLeafSequence(tr, entries));
      assert.deepEqual(entries, flatten(m.iterator()));
    };

    test([]);
    test([{key: 'a', value: 4}]);
    test([{key: 'a', value: 4}, {key: 'k', value: 8}]);
  });

  test('iteratorAt', async () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
                                makePrimitiveType(Kind.Int32));
    const build = entries => new NomsMap(ms, tr, new MapLeafSequence(tr, entries));

    assert.deepEqual([], await flatten(build([]).iteratorAt('a')));

    {
      const kv = [{key: 'b', value: 5}];
      assert.deepEqual(kv, await flatten(build(kv).iteratorAt('a')));
      assert.deepEqual(kv, await flatten(build(kv).iteratorAt('b')));
      assert.deepEqual([], await flatten(build(kv).iteratorAt('c')));
    }

    {
      const kv = [{key: 'b', value: 5}, {key: 'd', value: 10}];
      assert.deepEqual(kv, await flatten(build(kv).iteratorAt('a')));
      assert.deepEqual(kv, await flatten(build(kv).iteratorAt('b')));
      assert.deepEqual(kv.slice(1), await flatten(build(kv).iteratorAt('c')));
      assert.deepEqual(kv.slice(1), await flatten(build(kv).iteratorAt('d')));
      assert.deepEqual([], await flatten(build(kv).iteratorAt('e')));
    }
  });

  test('chunks', () => {
    const ms = new MemoryStore();
    const tr = makeCompoundType(Kind.Map,
                                makePrimitiveType(Kind.Value), makePrimitiveType(Kind.Value));
    const st = makePrimitiveType(Kind.String);
    const r1 = writeValue('x', st, ms);
    const r2 = writeValue('a', st, ms);
    const r3 = writeValue('b', st, ms);
    const r4 = writeValue('c', st, ms);
    const m = new NomsMap(ms, tr,
                          new MapLeafSequence(tr, [{key: r1, value: r2}, {key: r3, value: r4}]));
    assert.strictEqual(4, m.chunks.length);
    assert.isTrue(r1.equals(m.chunks[0]));
    assert.isTrue(r2.equals(m.chunks[1]));
    assert.isTrue(r3.equals(m.chunks[2]));
    assert.isTrue(r4.equals(m.chunks[3]));
  });
});

suite('CompoundMap', () => {
  function build(cs: ChunkStore): Array<NomsMap> {
    const tr = makeCompoundType(Kind.Map, makePrimitiveType(Kind.String),
        makePrimitiveType(Kind.Bool));
    const l1 = new NomsMap(cs, tr, new MapLeafSequence(tr, [{key: 'a', value: false},
        {key:'b', value:false}]));
    const r1 = writeValue(l1, tr, cs);
    const l2 = new NomsMap(cs, tr, new MapLeafSequence(tr, [{key: 'e', value: true},
        {key:'f', value:true}]));
    const r2 = writeValue(l2, tr, cs);
    const l3 = new NomsMap(cs, tr, new MapLeafSequence(tr, [{key: 'h', value: false},
        {key:'i', value:true}]));
    const r3 = writeValue(l3, tr, cs);
    const l4 = new NomsMap(cs, tr, new MapLeafSequence(tr, [{key: 'm', value: true},
        {key:'n', value:false}]));
    const r4 = writeValue(l4, tr, cs);

    const m1 = new NomsMap(cs, tr, new OrderedMetaSequence(tr, [new MetaTuple(r1, 'b'),
        new MetaTuple(r2, 'f')]));
    const rm1 = writeValue(m1, tr, cs);
    const m2 = new NomsMap(cs, tr, new OrderedMetaSequence(tr, [new MetaTuple(r3, 'i'),
        new MetaTuple(r4, 'n')]));
    const rm2 = writeValue(m2, tr, cs);

    const c = new NomsMap(cs, tr, new OrderedMetaSequence(tr, [new MetaTuple(rm1, 'f'),
        new MetaTuple(rm2, 'n')]));
    return [c, m1, m2];
  }

  test('isEmpty', () => {
    const ms = new MemoryStore();
    const [c] = build(ms);
    assert.isFalse(c.isEmpty());
  });

  test('get', async () => {
    const ms = new MemoryStore();
    const [c] = build(ms);

    assert.strictEqual(false, await c.get('a'));
    assert.strictEqual(false, await c.get('b'));
    assert.strictEqual(undefined, await c.get('c'));
    assert.strictEqual(undefined, await c.get('d'));
    assert.strictEqual(true, await c.get('e'));
    assert.strictEqual(true, await c.get('f'));
    assert.strictEqual(false, await c.get('h'));
    assert.strictEqual(true, await c.get('i'));
    assert.strictEqual(undefined, await c.get('j'));
    assert.strictEqual(undefined, await c.get('k'));
    assert.strictEqual(undefined, await c.get('l'));
    assert.strictEqual(true, await c.get('m'));
    assert.strictEqual(false, await c.get('n'));
    assert.strictEqual(undefined, await c.get('o'));
  });

  test('first/has', async () => {
    const ms = new MemoryStore();
    const [c, m1, m2] = build(ms);

    assert.deepEqual(['a', false], await c.first());
    assert.deepEqual(['a', false], await m1.first());
    assert.deepEqual(['h', false], await m2.first());

    assert.isTrue(await c.has('a'));
    assert.isTrue(await c.has('b'));
    assert.isFalse(await c.has('c'));
    assert.isFalse(await c.has('d'));
    assert.isTrue(await c.has('e'));
    assert.isTrue(await c.has('f'));
    assert.isTrue(await c.has('h'));
    assert.isTrue(await c.has('i'));
    assert.isFalse(await c.has('j'));
    assert.isFalse(await c.has('k'));
    assert.isFalse(await c.has('l'));
    assert.isTrue(await c.has('m'));
    assert.isTrue(await c.has('n'));
    assert.isFalse(await c.has('o'));
  });

  test('forEach', async () => {
    const ms = new MemoryStore();
    const [c] = build(ms);

    const kv = [];
    await c.forEach((v, k) => { kv.push(k, v); });
    assert.deepEqual(['a', false, 'b', false, 'e', true, 'f', true, 'h', false, 'i', true, 'm',
        true, 'n', false], kv);
  });

  test('iterator', async () => {
    const ms = new MemoryStore();
    const [c] = build(ms);
    assert.deepEqual([{key: 'a', value: false}, {key: 'b', value: false}, {key: 'e', value: true},
                      {key: 'f', value: true}, {key: 'h', value: false}, {key: 'i', value: true},
                      {key: 'm', value: true}, {key: 'n', value: false}],
                     await flatten(c.iterator()));
  });

  test('iteratorAt', async () => {
    const ms = new MemoryStore();
    const [c] = build(ms);
    const entries = [{key: 'a', value: false}, {key: 'b', value: false}, {key: 'e', value: true},
                     {key: 'f', value: true}, {key: 'h', value: false}, {key: 'i', value: true},
                     {key: 'm', value: true}, {key: 'n', value: false}];
    const offsets = {
      _: 0, a: 0,
      b: 1,
      c: 2, d: 2, e: 2,
      f: 3,
      g: 4, h: 4,
      i: 5,
      j: 6, k: 6, l: 6, m: 6,
      n: 7,
      o: 8,
    };
    for (const k in offsets) {
      assert.deepEqual(entries.slice(offsets[k]), await flatten(c.iteratorAt(k)));
    }
  });

  test('iterator return', async () => {
    const ms = new MemoryStore();
    const [c] = build(ms);
    const iter = c.iterator();
    const values = [];
    for (let res = await iter.next(); !res.done; res = await iter.next()) {
      values.push(res.value);
      if (values.length === 5) {
        await iter.return();
      }
    }
    assert.deepEqual([{key: 'a', value: false}, {key: 'b', value: false}, {key: 'e', value: true},
                      {key: 'f', value: true}, {key: 'h', value: false}],
                     values);
  });

  test('chunks', () => {
    const ms = new MemoryStore();
    const [c] = build(ms);
    assert.strictEqual(2, c.chunks.length);
  });
});
