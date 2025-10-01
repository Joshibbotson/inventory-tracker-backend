import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Material,
  MaterialDocument,
} from '../../materials/schemas/material.schema';
import {
  MaterialOrder,
  MaterialOrderDocument,
} from '../schemas/material-order.schema';
import { Model, Types } from 'mongoose';
import { CreateMaterialDto } from '../dto/CreateMaterialOrder.dto';

@Injectable()
export class MaterialOrderService {
  constructor(
    @InjectModel(MaterialOrder.name) private orderModel: Model<MaterialOrder>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
  ) {}

  async createOrder(
    orderDto: CreateMaterialDto,
    userId: string,
  ): Promise<MaterialOrder> {
    const material = await this.materialModel.findById(orderDto.material);

    if (!material) {
      throw new BadRequestException('Material not found');
    }

    const unitCost = orderDto.totalCost / orderDto.quantity;

    // Update material's rolling average cost
    const oldTotalValue = material.currentStock * material.averageCost;
    const newTotalValue = oldTotalValue + orderDto.totalCost;
    const newTotalQuantity = material.currentStock + orderDto.quantity;

    material.averageCost = newTotalValue / newTotalQuantity;
    material.currentStock = newTotalQuantity;

    if (orderDto.supplier) {
      material.supplier = orderDto.supplier;
    }

    await material.save();

    // Create order record
    const order = new this.orderModel({
      ...orderDto,
      material: new Types.ObjectId(orderDto.material),
      unitCost,
      createdBy: userId,
    });

    return order.save();
  }

  async getOrderById(_id: string): Promise<MaterialOrder> {
    const order = await this.orderModel.findById(_id);

    if (!order) throw new BadRequestException('Order does not exist');
    return order;
  }

  async getOrders(
    materialId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<MaterialOrderDocument[]> {
    const query: any = {};

    if (materialId) {
      query.material = materialId;
    }

    if (startDate && endDate) {
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    return this.orderModel
      .find(query)
      .populate('material')
      .sort('-createdAt')
      .exec();
  }

  async deleteOrder(orderId: string): Promise<void> {
    const order = await this.orderModel.findById(orderId).populate('material');

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Note: In production, you might want to prevent deletion if stock has been used
    // For now, we'll adjust the material stock and recalculate average
    const material = await this.materialModel.findById(order.material);

    if (!material) throw new BadRequestException('material does not exist');

    if (material.currentStock < order.quantity) {
      throw new BadRequestException('Cannot delete order - stock already used');
    }

    // Reverse the stock addition
    material.currentStock -= order.quantity;

    // Recalculate average cost (simplified - in production you'd track all orders)
    // This is a simplification and may not be perfectly accurate
    await material.save();

    await this.orderModel.deleteOne({ _id: orderId });
  }

  async getOrderStats(materialId: string): Promise<{
    totalOrders: number;
    totalQuantity: number;
    totalSpent: number;
    averageOrderSize: number;
    priceHistory: Array<{ date: Date; unitCost: number }>;
  }> {
    const orders = await this.orderModel.find({ material: materialId });

    const totalOrders = orders.length;
    const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
    const totalSpent = orders.reduce((sum, o) => sum + o.totalCost, 0);
    const averageOrderSize = totalOrders > 0 ? totalQuantity / totalOrders : 0;

    const priceHistory = orders.map((order) => ({
      date: order.createdAt,
      unitCost: order.unitCost,
    }));

    return {
      totalOrders,
      totalQuantity,
      totalSpent,
      averageOrderSize,
      priceHistory,
    };
  }
}
