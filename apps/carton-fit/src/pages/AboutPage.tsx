import { Callout, PageHeader, Section, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import {
  CARTON_LEAD_DAYS,
  CUSHION_MM,
  DIM_DIVISOR,
  FILL_FACTOR,
  SHIPPING_RATE_PER_KG,
  VOID_WARN,
  WALL_MM,
  WEIGH_TOLERANCE,
} from '../domain/config';

export function AboutPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="About Carton Fit" />

      <Section title="What it does">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Carton Fit computes the smallest in-stock shipping carton an order genuinely fits inside while honouring
          fragile cushioning, keep-upright orientation, and vertical stack limits. It shows the frosted void space and
          billable dimensional weight before tape hits cardboard, flags scale weigh-in discrepancies back to packaging
          engineering, and keeps corrugated carton stock ahead of supplier lead time.
        </p>
      </Section>

      <Section title="Rules & thresholds">
        <TableWrap>
          <Table>
            <thead>
              <Tr>
                <Th>Constant</Th>
                <Th numeric>Value</Th>
                <Th>Meaning</Th>
              </Tr>
            </thead>
            <tbody>
              <Tr>
                <Td className="font-mono">CUSHION_MM</Td>
                <Td numeric>{CUSHION_MM} mm</Td>
                <Td>Inflated on every side of a fragile unit; fragile units carry zero load on top</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">WALL_MM</Td>
                <Td numeric>{WALL_MM} mm</Td>
                <Td>Corrugated wall thickness per side (outer = inner + 2 × {WALL_MM} mm)</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">DIM_DIVISOR</Td>
                <Td numeric>{DIM_DIVISOR} cm³/kg</Td>
                <Td>Carrier volumetric weight divisor (400 × 300 × 200 mm outer = 24,000 cm³ → 4.8 kg)</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">VOID_WARN</Td>
                <Td numeric>{VOID_WARN}%</Td>
                <Td>Above this void share, the bench names the next smaller carton that failed and why</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">FILL_FACTOR</Td>
                <Td numeric>{FILL_FACTOR}</Td>
                <Td>Crinkled kraft paper void-fill estimate = void volume × {FILL_FACTOR}</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">WEIGH_TOLERANCE</Td>
                <Td numeric>±{Math.round(WEIGH_TOLERANCE * 100)}%</Td>
                <Td>Scale gap above this marks the order&apos;s SKUs unverified for engineering review</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">CARTON_LEAD_DAYS</Td>
                <Td numeric>{CARTON_LEAD_DAYS} days</Td>
                <Td>Projected demand = 7-day average daily usage × {CARTON_LEAD_DAYS} days</Td>
              </Tr>
              <Tr>
                <Td className="font-mono">SHIPPING_RATE_PER_KG</Td>
                <Td numeric>${SHIPPING_RATE_PER_KG.toFixed(2)}/kg</Td>
                <Td>Reference carrier rate combined with carton unitCost to pick least billable cost</Td>
              </Tr>
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Callout tone="info" title="Operational guidance">
        Carton Fit supports warehouse packing and cartonisation decisions; it is not carrier billing, hazardous-goods,
        or structural packaging certification advice. Verify final carrier DIM divisors and fragile drop-test
        requirements against your carrier contract.
      </Callout>
    </div>
  );
}
