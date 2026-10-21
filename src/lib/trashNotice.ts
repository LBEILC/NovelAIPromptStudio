// 移入回收站的通知（doc/design.md 2.23）：一版剩下的最后一张图移走、而且这一版后面没有别的版本时，
// 这一版跟着移走，通知里说一句；是一条分支的最后一版时说分支。
type Moved = { workName: string; number: number; branchName: string; lastOfBranch: boolean };

export function trashNotice(base: string, versions: Moved[] = [], withWork = false) {
  if (!versions.length) return base;
  if (versions.length > 1) return `${base}，${versions.length} 个没有图的版本一起移走`;
  const [v] = versions;
  const where = withWork && v.workName ? `「${v.workName}」` : '';
  // 名字以数字或英文结尾时和后面的汉字隔一个空格
  const sp = /[!-~]$/.test(v.branchName) ? ' ' : '';
  return v.lastOfBranch
    ? `${base}，${where}${v.branchName}${sp}只剩这一版，一起移走`
    : `${base}，${where}第 ${v.number} 版没有图了，一起移走`;
}
