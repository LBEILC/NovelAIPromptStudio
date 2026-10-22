// 作品名怎么显示（1.6.0）：没起名的作品，名字就是原图的文件名，多半是一串哈希，不拿来显示，
// 换成"这个作品""另一个作品"这样的说法（用户 10-22 截图：弹框里全是哈希，按钮还撑出了框）。
import { isUnnamedImage } from './imageNaming.js';

export const namedWork = (name?: string) => !!name && !isUnnamedImage(name);

/** 起过名字是「名字」，没起名用 fallback */
export const workLabel = (name: string | undefined, fallback: string) =>
  namedWork(name) ? `「${name}」` : fallback;
