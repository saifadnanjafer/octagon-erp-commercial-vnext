import { NextRequest, NextResponse } from 'next/server'
import { EmployeeService } from '@/services/employeeService'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const departmentId = searchParams.get('departmentId')

    const filters: any = {}
    if (status) filters.status = status
    if (departmentId) filters.departmentId = parseInt(departmentId)

    const employees = await EmployeeService.list(filters)
    return NextResponse.json(employees)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const employee = await EmployeeService.create(body)
    return NextResponse.json(employee, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }
}
