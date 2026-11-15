<template>
  <div class="page">
    <el-alert v-if="!info.publicKeyConfigured" type="warning" :closable="false" class="alert"
              title="本机未配置验签公钥（mse.license.public-key），无法校验部署包——请先完成配置" />

    <el-card shadow="never" class="block">
      <template #header>部署数据包导入</template>
      <el-upload drag :auto-upload="false" :limit="1" :on-change="onFileChange" :on-remove="onFileRemove"
                 accept=".zip" class="upload">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽部署数据包（delivery/deploy-package.zip）到此处，或 <em>点击选择</em></div>
      </el-upload>
      <div class="actions">
        <el-button type="primary" :disabled="!file" :loading="planning" @click="doPlan">校验并预览计划</el-button>
        <el-button type="warning" :disabled="!file" :loading="applying" @click="doApply">直接应用（含校验）</el-button>
      </div>
      <div class="tip">
        上传对象 = 最终交付包内的 delivery/deploy-package.zip（数据载荷：凭证 + 租户数据）；
        正常交付经通用安装器部署后应用启动自动导入，本页为兜底通道。
        导入流程：验签（平台 RS256 签名，与 license 同一公钥）→ 逐文件校验 → 版本基线/租户编码比对 →
        license.token 落盘（60s 内热生效）→ 数据按表整表替换装载（每表独立事务，失败可重试）。
      </div>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>导入历史</template>
      <el-table :data="records" border size="small">
        <el-table-column prop="id" label="编号" width="70" />
        <el-table-column prop="file_name" label="部署包" show-overflow-tooltip />
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">{{ row.package_type === 'FULL' ? '全量' : '升级' }}</template>
        </el-table-column>
        <el-table-column prop="tenant_code" label="租户编码" width="120" />
        <el-table-column label="阶段" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.phase === 'DONE' ? 'success' : row.phase === 'FAILED' ? 'danger' : 'info'" size="small">
              {{ row.phase }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="装载" width="140">
          <template #default="{ row }">{{ row.applied_tables }} 表 / {{ row.applied_rows }} 行</template>
        </el-table-column>
        <el-table-column prop="error_msg" label="失败原因" show-overflow-tooltip />
        <el-table-column prop="create_time" label="时间" width="170" />
      </el-table>
    </el-card>

    <el-dialog v-model="planDialog" title="导入计划" width="720px">
      <el-descriptions :column="2" border size="small" class="plan-desc">
        <el-descriptions-item label="包类型">{{ plan?.packageType === 'FULL' ? '全量部署包' : '升级包' }}</el-descriptions-item>
        <el-descriptions-item label="租户">{{ plan?.tenantName }}（{{ plan?.tenantCode }}）</el-descriptions-item>
        <el-descriptions-item label="随包凭证">{{ plan?.licenseId || '无' }}</el-descriptions-item>
        <el-descriptions-item label="数据规模">{{ plan?.tables.length }} 表 / {{ plan?.totalRows }} 行</el-descriptions-item>
      </el-descriptions>
      <div class="checks">
        <div v-for="(check, i) in plan?.checks ?? []" :key="i" class="check-line">
          <el-tag :type="check.includes('不足') || check.includes('不符') || check.includes('拒绝') ? 'danger' : 'success'"
                  size="small" class="check-tag">{{ check.includes('不足') || check.includes('不符') || check.includes('拒绝') ? '阻断' : '通过' }}</el-tag>
          {{ check }}
        </div>
      </div>
      <template #footer>
        <el-button @click="planDialog = false">取消</el-button>
        <el-button type="warning" :disabled="!plan?.ready" :loading="applying" @click="doApplyFromPlan">
          {{ plan?.ready ? '确认应用' : '存在阻断项，不可应用' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import request from '../../api/request'

const info = ref<any>({})
const file = ref<File | null>(null)
const planning = ref(false)
const applying = ref(false)
const planDialog = ref(false)
const plan = ref<any>(null)
const records = ref<any[]>([])

async function loadInfo() {
  try {
    info.value = await request.get('/deliver/import/info')
  } catch {
    info.value = { publicKeyConfigured: true, tenantCode: '-', licenseState: '-' }
  }
}

async function loadRecords() {
  try {
    records.value = await request.get('/deliver/import/records')
  } catch {
    records.value = []
  }
}

function onFileChange(uploadFile: any) {
  file.value = uploadFile.raw
}

function onFileRemove() {
  file.value = null
}

function formData(): FormData {
  const data = new FormData()
  data.append('file', file.value as File)
  return data
}

async function doPlan() {
  planning.value = true
  try {
    plan.value = await request.post('/deliver/import/plan', formData(), { timeout: 600000 })
    planDialog.value = true
  } finally {
    planning.value = false
  }
}

async function doApplyFromPlan() {
  applying.value = true
  try {
    const result = await request.post('/deliver/import/apply', formData(), { timeout: 3600000 })
    planDialog.value = false
    showResult(result)
  } finally {
    applying.value = false
  }
}

async function doApply() {
  applying.value = true
  try {
    const result = await request.post('/deliver/import/apply', formData(), { timeout: 3600000 })
    showResult(result)
  } finally {
    applying.value = false
  }
}

function showResult(result: any) {
  if (result.success) {
    ElMessage.success(result.summary)
  } else {
    ElMessage.error(`${result.summary}：${result.error ?? ''}`)
  }
  loadRecords()
  loadInfo()
}

onMounted(() => {
  loadInfo()
  loadRecords()
})
</script>

<style scoped>
.alert {
  margin-bottom: 12px;
}
.block {
  margin-bottom: 12px;
}
.upload {
  width: 100%;
}
.actions {
  margin-top: 12px;
  display: flex;
  gap: 12px;
}
.tip {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.plan-desc {
  margin-bottom: 12px;
}
.checks {
  max-height: 260px;
  overflow: auto;
}
.check-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
  line-height: 1.5;
}
.check-tag {
  flex-shrink: 0;
}
</style>
