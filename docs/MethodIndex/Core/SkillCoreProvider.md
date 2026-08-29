# Core / SkillCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SkillCoreAccess

源码：`brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `matchSkill` | `input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, metrics?: ...` | `Promise<boolean>` | 匹配 Skill（带缓存与 LLM 排序） |
| `optSkill` | `input: OptSkillInput, output: OptSkillOutput, context: SkillCoreContext, metrics?: Metr...` | `Promise<boolean>` | 自动绑定 Skill 并记录使用 |
| `ageSkill` | `input: AgeSkillInput, output: AgeSkillOutput, context: SkillCoreContext, metrics?: Metr...` | `Promise<boolean>` | 年龄化过期 Skill |
| `soSkillRule` | `input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?...` | `Promise<boolean>` | 查询 Skill 优化规则 |
| `updateSkillRule` | `input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, ...` | `Promise<boolean>` | 批量更新 Skill 优化规则 |
| `configSkillCore` | `input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, context: SkillCoreContext, ...` | `Promise<boolean>` | 返回 skill_core_config 配置 |
