import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Material,
  MaterialDocument,
} from '../../materials/schemas/material.schema';
import {
  MaterialOrder,
  MaterialOrderDocument,
} from '../schemas/material-order.schema';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import { CreateMaterialOrderDto } from '../dto/CreateMaterialOrder.dto';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';
import { OrderListStats } from '../types/OrderListStats';

@Injectable()
export class MaterialOrderService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(MaterialOrder.name) private orderModel: Model<MaterialOrder>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
  ) {}

  async createOrder(
    orderDto: CreateMaterialOrderDto,
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
    const order = await this.orderModel.findById(_id).populate('material');

    if (!order) throw new BadRequestException('Order does not exist');
    return order;
  }

  async getOrders(
    page = 1,
    pageSize = 10,
    filters: { materialId?: string; startDate?: string; endDate?: string },
  ): Promise<
    PaginatedResponse<MaterialOrderDocument> & {
      orderListStats: OrderListStats;
    }
  > {
    const query: any = {};
    const skip = (page - 1) * pageSize;

    if (filters.materialId) {
      query.material = new Types.ObjectId(filters.materialId);
    }

    if (filters.startDate && filters.endDate) {
      query.createdAt = { $gte: filters.startDate, $lte: filters.endDate };
    }

    const [data, total, orderListStats] = await Promise.all([
      this.orderModel
        .find(query)
        .populate({
          path: 'material',
          populate: {
            path: 'unit',
          },
        })
        .sort('-createdAt')
        .skip(skip)
        .limit(pageSize),
      this.orderModel.countDocuments(query),
      this.getOrderStatistics(query),
    ]);

    return {
      data,
      page,
      pageSize,
      total,
      orderListStats,
    };
  }

  private async getOrderStatistics(
    query: FilterQuery<MaterialOrder>,
  ): Promise<OrderListStats> {
    const pipeline = [
      // Apply the same filters as the main query
      { $match: query },

      // Group and calculate statistics
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalCost' },
          totalUnits: { $sum: '$quantity' },
          averageOrderValue: { $avg: '$totalCost' },
        },
      },
    ];

    const result = await this.orderModel.aggregate(pipeline).exec();

    // If no results (empty collection or no matches), return defaults
    if (result.length === 0) {
      return {
        totalOrders: 0,
        totalSpent: 0,
        totalUnits: 0,
        averageOrderValue: 0,
      };
    }

    return {
      totalOrders: result[0].totalOrders,
      totalSpent: result[0].totalSpent,
      totalUnits: result[0].totalUnits,
      averageOrderValue: result[0].averageOrderValue,
    };
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

    return await this.connection.transaction(async () => {
      const previousStock = material.currentStock;
      const newStock = previousStock - order.quantity;

      // Recalculate average cost
      const currentTotalValue = previousStock * material.averageCost;
      const removedValue = order.quantity * order.unitCost;
      const newTotalValue = Math.max(0, currentTotalValue - removedValue);

      if (newStock > 0) {
        material.averageCost = newTotalValue / newStock;
      } else {
        material.averageCost = 0;
      }

      material.currentStock = newStock;
      await material.save();

      await this.orderModel.deleteOne({ _id: orderId });
    });
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
