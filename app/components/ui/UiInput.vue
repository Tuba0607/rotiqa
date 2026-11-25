<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  label: string
  type?: string
  error?: string
  hint?: string
}>(), { type: 'text' })

const id = useId()
const isPassword = computed(() => props.type === 'password')
const revealed = ref(false)
const inputType = computed(() => (isPassword.value && revealed.value ? 'text' : props.type))
const describedBy = computed(() => [props.error ? `${id}-error` : '', props.hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-sm font-semibold text-navy-950"
    >{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        v-model="model"
        v-bind="$attrs"
        :type="inputType"
        :class="[fieldClasses(!!error), isPassword ? 'pr-14' : '']"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
      >
      <button
        v-if="isPassword"
        type="button"
        class="absolute inset-y-0 right-0 grid w-touch place-items-center rounded-r-xl text-navy-500 hover:text-navy-950 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30"
        :aria-label="revealed ? 'Şifreyi gizle' : 'Şifreyi göster'"
        :aria-pressed="revealed"
        :aria-controls="id"
        @click="revealed = !revealed"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle
            cx="12"
            cy="12"
            r="3"
          />
          <path
            v-if="revealed"
            d="M3 3l18 18"
          />
        </svg>
      </button>
    </div>
    <p
      v-if="hint && !error"
      :id="`${id}-hint`"
      class="text-sm text-navy-500"
    >
      {{ hint }}
    </p>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="text-sm font-medium text-red-700"
    >
      {{ error }}
    </p>
  </div>
</template>
