<template>
  <el-dialog v-model="visible" title="修改密码" width="420px" @closed="resetForm">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" @submit.prevent>
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password placeholder="当前登录密码" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password placeholder="6-32 位" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="doSubmit">确 定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import request from '../api/request'
import { IS_PLATFORM } from '../config/side'

/** 改密端点按侧固定（后端双账号体系注解区分） */
const CHANGE_PASSWORD_URL = IS_PLATFORM ? '/system/profile/platform/password' : '/system/profile/password'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ success: [] }>()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== form.newPassword) callback(new Error('两次输入的新密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
}

function resetForm() {
  formRef.value?.resetFields()
}

async function doSubmit() {
  await formRef.value?.validate()
  loading.value = true
  try {
    await request.put(CHANGE_PASSWORD_URL, {
      oldPassword: form.oldPassword,
      newPassword: form.newPassword
    })
    visible.value = false
    emit('success')
  } finally {
    loading.value = false
  }
}
</script>
