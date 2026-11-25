<script setup lang="ts">
import { employeeSchema } from '#shared/schemas/staff'

export interface EmployeeFormValue {
  firstName: string
  lastName: string
  locationId: string
  departmentId: string
}

const props = defineProps<{
  initial?: Partial<EmployeeFormValue>
  submitLabel: string
  locations: { id: string, name: string }[]
  departments: { id: string, name: string }[]
  submit: (value: { firstName: string, lastName: string, locationId: string, departmentId: string | null }) => Promise<void>
}>()

const form = reactive<EmployeeFormValue>({
  firstName: props.initial?.firstName ?? '',
  lastName: props.initial?.lastName ?? '',
  locationId: props.locations.find(l => l.id === props.initial?.locationId)?.id ?? props.locations[0]?.id ?? '',
  departmentId: props.initial?.departmentId ?? '',
})
const errors = ref<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)
const formEl = ref<HTMLFormElement>()

async function onSubmit() {
  error.value = ''
  const value = { ...form, departmentId: form.departmentId || null }
  const parsed = employeeSchema.safeParse(value)
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))
    focusFirstInvalid(formEl.value)
    return
  }
  errors.value = {}
  submitting.value = true
  try {
    await props.submit({ ...parsed.data, departmentId: parsed.data.departmentId ?? null })
  }
  catch (e) {
    errors.value = apiFieldErrors(e)
    error.value = apiErrorMessage(e)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form
    ref="formEl"
    class="flex flex-col gap-4"
    novalidate
    @submit.prevent="onSubmit"
  >
    <UiAlert
      v-if="error"
      variant="error"
    >
      {{ error }}
    </UiAlert>
    <div class="grid gap-4 sm:grid-cols-2">
      <UiInput
        v-model="form.firstName"
        label="Ad"
        autocomplete="off"
        :error="errors.firstName"
      />
      <UiInput
        v-model="form.lastName"
        label="Soyad"
        autocomplete="off"
        :error="errors.lastName"
      />
    </div>
    <UiSelect
      v-model="form.locationId"
      label="Şube"
      :options="locations.map(l => ({ value: l.id, label: l.name }))"
      :error="errors.locationId"
    />
    <UiSelect
      v-model="form.departmentId"
      label="Departman"
      placeholder="Departman yok"
      :options="departments.map(d => ({ value: d.id, label: d.name }))"
      :error="errors.departmentId"
    />
    <UiButton
      type="submit"
      size="lg"
      :loading="submitting"
    >
      {{ submitLabel }}
    </UiButton>
  </form>
</template>
