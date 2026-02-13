# Design Mode Improvement Plan

## Problems
1. UX: No discoverability, no mode indicator, undocumented shortcuts
2. Bug: VPC design toolbar never injected when clicking individual VPCs
3. Bug: `add_route` has apply logic but no UI form (dead code)
4. Hardcoded: AZs locked to us-east-1a/b/c
5. Missing: Can't remove gateways
6. Missing: No Redshift in resource options
7. Missing: No Security Group operations
8. Bug: CLI export missing for split_subnet creates, add_resource, remove_resource
9. UX: Change log descriptions too generic
10. UX: No help/onboarding for Design Mode

## Implementation Order
1. Design Mode banner with shortcut hints
2. Fix VPC design toolbar injection
3. Add `add_route` form and button
4. Dynamic AZ detection from loaded data
5. Gateway removal support
6. Redshift in add_resource
7. Security Group add/assign
8. Fix CLI export gaps
9. Better change log descriptions
10. Help tooltip on Design button
