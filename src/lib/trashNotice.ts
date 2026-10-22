// 移入回收站的通知（doc/design.md 2.23）：一版剩下的最后一张图移走、而且这一版后面没有别的版本时，
// 这一版跟着移走，通知里说一句；是一条分支的最后一版时说分支。
import { namedWork, workLabel } from './workNames';

type Moved = { workName: string; number: number; branchName: string; lastOfBranch: boolean };

// 1.5.1：移走的图里有某个作品的原图时也说一句，作品照旧、从起点继续
export function trashNotice(
  base: string,
  versions: Moved[] = [],
  withWork = false,
  originsOf: string[] = [],
) {
  const origin = !originsOf.length
    ? ''
    : originsOf.length > 1
      ? `，其中有 ${originsOf.length} 个作品的原图，这些作品从起点继续`
      : `，其中有${workLabel(originsOf[0], '一个作品')}的原图，这个作品从起点继续`;
  return moved(base, versions, withWork) + origin;
}
function moved(base: string, versions: Moved[], withWork: boolean) {
  if (!versions.length) return base;
  if (versions.length > 1) return `${base}，${versions.length} 个没有图的版本一起移走`;
  const [v] = versions;
  const where = withWork && namedWork(v.workName) ? `「${v.workName}」` : '';
  // 名字以数字或英文结尾时和后面的汉字隔一个空格
  const sp = /[!-~]$/.test(v.branchName) ? ' ' : '';
  return v.lastOfBranch
    ? `${base}，${where}${v.branchName}${sp}只剩这一版，一起移走`
    : `${base}，${where}第 ${v.number} 版没有图了，一起移走`;
}
