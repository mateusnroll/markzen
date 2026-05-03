# Deployment Guide for Production Systems

This guide covers everything you need to know about deploying services to production.

## Infrastructure Requirements

Before deploying, ensure your infrastructure meets the baseline requirements listed below.

### Hardware Specifications

Each node in the cluster requires at least 8 GB of RAM and 4 CPU cores.

#### Network Configuration

All nodes must be reachable on ports 443 and 8080 within the internal subnet.

##### TLS Certificate Management

Certificates are rotated automatically every 90 days via the `cert-manager` controller.

###### Footnotes on Certificate Pinning

Certificate pinning is discouraged in most client applications due to rotation complexity.

## Headings with **Bold** and *Italic* Formatting

Some headings contain inline formatting to emphasize key terms.

### Using `code` Inside a Heading

Configuration files often appear in section titles.

### A ~~Deprecated~~ Approach to Load Balancing

This section was rewritten after the migration to the new proxy layer.

## **Entirely Bold Heading**

### *Entirely Italic Heading*

### Combining **bold**, *italic*, and `code` in One Heading

## Back-to-Back Sections
### Without Any Paragraph Between Them
#### Three Levels Deep

The above headings appear consecutively with no intervening text.

## Setext Ambiguity Test

The following line is a horizontal rule, not a Setext heading marker.

---

This paragraph follows a horizontal rule that could be confused with a Setext-style heading underline.

## Final Section

This concludes the heading tests.
