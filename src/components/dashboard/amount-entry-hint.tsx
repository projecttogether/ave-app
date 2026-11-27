import { FieldDescription } from '@/components/ui/field'

export function AmountEntryHint({ id }: { id: string }) {
    return (
        <FieldDescription id={id}>
            Bitte trage auch Nullwerte ausdrücklich als 0 ein. Ein leeres Feld bedeutet, dass noch keine Angabe vorliegt.
        </FieldDescription>
    )
}
