import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectRail } from './ProjectRail';

describe('ProjectRail', () => {
  it('renders every financial source and gap from the project summary', () => {
    render(<ProjectRail
      approvedAmount="800000.00"
      executionCost="430000.00"
      summary={{
        receivableAmount: '800000.00', receivedAmount: '600000.00', invoicedAmount: '500000.00', receivedInvoiceAmount: '320000.00',
        memberDueReceivedAmount: '12000.00', memberDueInvoicedAmount: '8000.00',
        payableExecutionAmount: '350000.00', paidExecutionAmount: '200000.00', paidExpertAmount: '80000.00',
        unreceivedAmount: '200000.00', uninvoicedAmount: '100000.00', unpaidExecutionAmount: '150000.00',
      }}
    />);
    expect(screen.getByText('项目资金轨道')).toBeTruthy();
    expect(screen.getByText('支持协议')).toBeTruthy();
    expect(screen.getByText('已收支持款')).toBeTruthy();
    expect(screen.getByText('已开票')).toBeTruthy();
    expect(screen.getByText('已收票')).toBeTruthy();
    expect(screen.getByText('会费实收')).toBeTruthy();
    expect(screen.getByText('会费已开票')).toBeTruthy();
    expect(screen.getByText('已付专家费')).toBeTruthy();
    expect(screen.getByText(/待收/)).toBeTruthy();
  });
});
