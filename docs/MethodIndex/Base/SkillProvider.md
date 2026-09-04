# Base / SkillProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SkillAccess

源码：`brian-backend/Base/SkillProvider/access/SkillAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `addSkill` | `input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | 新增 Skill |
| `soSkillById` | `input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | 获取 Skill |
| `updateSkill` | `input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Me...` | `Promise<boolean>` | 更新 Skill |
| `delSkill` | `input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | 删除 Skill |
| `soSkill` | `input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, r...` | `Promise<boolean>` | 搜索 Skill |
| `execSkill` | `input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metric...` | `Promise<boolean>` | 执行 Skill（沙箱执行） |
| `enableSkill` | `input: EnableSkillInput, output: EnableSkillOutput, context: SkillContext, metrics?: Me...` | `Promise<boolean>` | 启用/禁用 Skill 组件 |
