import { it, expect } from 'vitest';
import { trashNotice } from './trashNotice';

const v = (number: number, lastOfBranch = false) => ({
  workName: '雨后微光',
  number,
  branchName: '分支 2',
  lastOfBranch,
});
it('mentions versions that leave together with their last image', () => {
  expect(trashNotice('已移入回收站')).toBe('已移入回收站');
  expect(trashNotice('已移入回收站', [v(3)])).toBe('已移入回收站，第 3 版没有图了，一起移走');
  expect(trashNotice('已移入回收站', [v(3, true)])).toBe(
    '已移入回收站，分支 2 只剩这一版，一起移走',
  );
  expect(trashNotice('已移入回收站', [v(3)], true)).toBe(
    '已移入回收站，「雨后微光」第 3 版没有图了，一起移走',
  );
  expect(trashNotice('已将 3 张移入回收站', [v(3), v(4)])).toBe(
    '已将 3 张移入回收站，2 个没有图的版本一起移走',
  );
});
