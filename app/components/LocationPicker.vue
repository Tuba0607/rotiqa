<script setup lang="ts">
/**
 * Branch choice for org pages. Owners (and managers with several branches) get a select of the
 * branches they can access; a manager with one branch sees its name as text instead.
 * Access itself is enforced by the API and RLS, never by this component.
 */
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  locations: { id: string, name: string }[]
  label?: string
  labelClass?: string
  error?: string
}>(), { label: 'Şube', labelClass: undefined, error: undefined })

const { data: overview } = useOrganization()
const selectable = computed(() => showLocationSelect(overview.value?.role, props.locations.length))
const current = computed(() => props.locations.find(l => l.id === model.value) ?? props.locations[0])
</script>

<template>
  <UiSelect
    v-if="selectable"
    v-model="model"
    v-bind="$attrs"
    :label="label"
    :label-class="labelClass"
    :error="error"
    :options="locations.map(l => ({ value: l.id, label: l.name }))"
  />
  <p
    v-else-if="current"
    class="flex min-h-touch min-w-0 items-center gap-1.5 text-sm text-navy-500"
    data-testid="fixed-location"
  >
    <svg
      viewBox="0 0 24 24"
      class="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    ><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle
      cx="12"
      cy="10"
      r="2.5"
    /></svg>
    <span class="truncate"><span class="sr-only">{{ label }}: </span><span class="font-semibold text-navy-950">{{ current.name }}</span></span>
  </p>
</template>
