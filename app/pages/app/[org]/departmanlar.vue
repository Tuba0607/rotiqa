<script setup lang="ts">
import { readableTextColor } from '#shared/utils/color'
import { defaultDepartmentColor } from '#shared/utils/shift-codes'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Departmanlar · Rotiqa' })

interface Department { id: string, name: string, color: string, isActive: boolean, sortOrder: number }

const { slug, isOwner } = useOrganization()
const { data: departments, error, refresh } = await useFetch<Department[]>(() => `/api/orgs/${slug.value}/departments`, { query: { all: '1' } })

const editingId = ref<string | null>(null)
const form = reactive({ name: '', color: defaultDepartmentColor(0) })
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

function startCreate() {
  editingId.value = 'new'
  form.name = ''
  form.color = defaultDepartmentColor(departments.value?.length ?? 0)
  formError.value = ''
  fieldErrors.value = {}
}

function startEdit(department: Department) {
  editingId.value = department.id
  form.name = department.name
  form.color = department.color
  formError.value = ''
  fieldErrors.value = {}
}

async function save() {
  formError.value = ''
  saving.value = true
  try {
    const isNew = editingId.value === 'new'
    await $fetch(isNew ? `/api/orgs/${slug.value}/departments` : `/api/orgs/${slug.value}/departments/${editingId.value}`, {
      method: isNew ? 'POST' : 'PATCH',
      body: { name: form.name, color: form.color },
    })
    editingId.value = null
    await refresh()
  }
  catch (e) {
    fieldErrors.value = apiFieldErrors(e)
    formError.value = apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}

async function toggleActive(department: Department) {
  formError.value = ''
  try {
    await $fetch(`/api/orgs/${slug.value}/departments/${department.id}`, { method: 'PATCH', body: { isActive: !department.isActive } })
    await refresh()
  }
  catch (e) {
    formError.value = apiErrorMessage(e)
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UiPageHeader
      title="Departmanlar"
      :description="isOwner ? 'Departman renkleri vardiya tablosunda ve paylaşılan görselde isim sütununu renklendirir.' : 'Departmanları yalnızca işletme sahibi düzenleyebilir.'"
    >
      <template
        v-if="isOwner"
        #actions
      >
        <UiButton
          v-if="editingId !== 'new'"
          @click="startCreate"
        >
          Departman ekle
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert
      v-if="formError && !editingId"
      variant="error"
    >
      {{ formError }}
    </UiAlert>

    <UiCard v-if="isOwner && editingId">
      <form
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="save"
      >
        <h2 class="font-semibold">
          {{ editingId === 'new' ? 'Yeni departman' : 'Departmanı düzenle' }}
        </h2>
        <UiAlert
          v-if="formError"
          variant="error"
        >
          {{ formError }}
        </UiAlert>
        <UiInput
          v-model="form.name"
          label="Departman adı"
          placeholder="Örn. Salon"
          :error="fieldErrors.name"
        />
        <UiColorPicker
          v-model="form.color"
          label="Renk"
        />
        <div class="flex gap-2">
          <UiButton
            type="submit"
            :loading="saving"
          >
            Kaydet
          </UiButton>
          <UiButton
            variant="ghost"
            @click="editingId = null"
          >
            Vazgeç
          </UiButton>
        </div>
      </form>
    </UiCard>

    <UiAlert
      v-if="error"
      variant="error"
    >
      {{ apiErrorMessage(error) }}
    </UiAlert>
    <UiEmptyState
      v-else-if="!departments?.length"
      title="Henüz departman yok"
      :description="isOwner ? 'Salon, Mutfak gibi departmanlar oluşturun.' : undefined"
    />
    <ul
      v-else
      class="flex flex-col divide-y divide-cream-200 overflow-hidden rounded-card bg-white shadow-card"
    >
      <li
        v-for="department in departments"
        :key="department.id"
        class="flex min-h-14 items-center gap-3 px-4 py-2"
      >
        <span
          class="rounded-md px-2.5 py-1 text-sm font-bold uppercase"
          :style="{ backgroundColor: department.color, color: readableTextColor(department.color) }"
        >{{ department.name }}</span>
        <UiBadge
          v-if="!department.isActive"
          tone="warning"
        >
          Pasif
        </UiBadge>
        <div
          v-if="isOwner"
          class="ml-auto flex gap-1"
        >
          <UiButton
            variant="ghost"
            @click="startEdit(department)"
          >
            Düzenle
          </UiButton>
          <UiButton
            variant="ghost"
            @click="toggleActive(department)"
          >
            {{ department.isActive ? 'Pasif yap' : 'Aktif yap' }}
          </UiButton>
        </div>
      </li>
    </ul>
  </div>
</template>
