import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) throw new AppError('User does not exist');

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (existentProducts.length === 0) throw new AppError('Products not found');

    const existentProductsIds = existentProducts.map(p => p.id);

    const checkInexistentProducts = products.filter(
      product => !existentProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length)
      throw new AppError(`Product ${checkInexistentProducts[0].id} not found`);

    const findProductsWithNoStockAvailable = products.filter(
      product =>
        existentProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithNoStockAvailable.length)
      throw new AppError(
        `Quantity ${findProductsWithNoStockAvailable[0].quantity} is not available for ${findProductsWithNoStockAvailable[0].id}`,
      );

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQtd = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existentProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQtd);

    return order;
  }
}

export default CreateOrderService;
